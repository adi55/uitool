param(
    [Parameter(Position = 0)]
    [string]$Command = "start",
    [string]$Scenario = "recorder-tool\examples\nightly-login-candidate-tasknmotion.json",
    [string]$Profile = "tim-ui-junit4-selenide",
    [string]$ClassName = "NightlyLoginGeneratedTest",
    [int]$ServerPort = 0,
    [int]$ChromeDebugPort = 0,
    [switch]$Headless,
    [switch]$SkipBuild,
    [switch]$SkipChrome
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$RuntimeDir = Join-Path $Root ".runtime"
$DownloadsDir = Join-Path $RuntimeDir "downloads"
$LogsDir = Join-Path $RuntimeDir "logs"
$ChromeProfileDir = Join-Path $RuntimeDir "chrome-profile"
$ManagedChromeDir = Join-Path $RuntimeDir "chrome-for-testing"
$ConfigDir = Join-Path $Root "config"
$ConfigFile = Join-Path $ConfigDir "recorder.local.properties"
$ConfigTemplateFile = Join-Path $ConfigDir "recorder.local.properties.template"
$BuildDir = Join-Path $Root "build"
$DistDir = Join-Path $Root "dist"
$BackendPidFile = Join-Path $RuntimeDir "backend.json"
$ChromePidFile = Join-Path $RuntimeDir "chrome.json"
$RuntimeStateFile = Join-Path $RuntimeDir "runtime-state.json"
$DetachedInputFile = Join-Path $RuntimeDir "detached-input.txt"
$ExtensionDir = Join-Path $Root "recorder-tool\chrome-extension"
$ExamplesDir = Join-Path $Root "recorder-tool\examples"
$GeneratedDir = Join-Path $Root "recorder-tool\generated"
$DistJar = Join-Path $DistDir "recorder-tool.jar"

function Write-Info([string]$Message) {
    Write-Host "[recorder] $Message"
}

function Write-WarnLine([string]$Message) {
    Write-Warning "[recorder] $Message"
}

function Fail([string]$Message) {
    throw "[recorder] $Message"
}

function Ensure-Directory([string]$Path) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Ensure-ProjectScaffolding() {
    Ensure-Directory $RuntimeDir
    Ensure-Directory $DownloadsDir
    Ensure-Directory $LogsDir
    Ensure-Directory $ChromeProfileDir
    Ensure-Directory $ManagedChromeDir
    Ensure-Directory $ConfigDir
    Ensure-Directory $ExamplesDir
    Ensure-Directory $GeneratedDir
    if (-not (Test-Path $DetachedInputFile)) {
        Set-Content -Path $DetachedInputFile -Value @() -Encoding ASCII
    }
}

function Ensure-ConfigFiles() {
    $template = @"
# TIM UI Recorder local configuration template.
# Environment variables take precedence over values in recorder.local.properties.
# Leave secrets blank here if you prefer to inject them via the environment.

TIM_UI_RECORDER_USERNAME=
TIM_UI_RECORDER_PASSWORD=
TIM_UI_RECORDER_LOGIN_URL=https://nightly.tim-bpm.com/tim/client/login
TIM_UI_RECORDER_SERVER_PORT=17845
TIM_UI_RECORDER_CHROME_DEBUG_PORT=9222
TIM_UI_RECORDER_CHROME_PATH=
"@
    if (-not (Test-Path $ConfigTemplateFile)) {
        Set-Content -Path $ConfigTemplateFile -Value $template -Encoding UTF8
    }
    if (-not (Test-Path $ConfigFile)) {
        Set-Content -Path $ConfigFile -Value $template -Encoding UTF8
    }
}

function Read-PropertiesFile([string]$Path) {
    $properties = @{}
    if (-not (Test-Path $Path)) {
        return $properties
    }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        $key = $parts[0].Trim()
        $value = if ($parts.Length -gt 1) { $parts[1].Trim() } else { "" }
        if (-not [string]::IsNullOrWhiteSpace($key)) {
            $properties[$key] = $value
        }
    }
    return $properties
}

function Apply-LocalConfiguration([hashtable]$Properties) {
    foreach ($entry in $Properties.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($entry.Key, "Process")) -and -not [string]::IsNullOrWhiteSpace($entry.Value)) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
        }
    }
}

function Resolve-Setting([hashtable]$Properties, [string]$Name, [string]$DefaultValue = "") {
    $current = [Environment]::GetEnvironmentVariable($Name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($current)) {
        return $current
    }
    if ($Properties.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace([string]$Properties[$Name])) {
        return [string]$Properties[$Name]
    }
    return $DefaultValue
}

function Get-NativeText([string]$FilePath, [string[]]$Arguments) {
    $argumentText = $Arguments -join " "
    return (& cmd.exe /c """$FilePath"" $argumentText 2>&1")
}

function Get-RemoteContentLength([string]$Url) {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($null -eq $curl) {
        return $null
    }
    $headers = & $curl.Source -I -s $Url
    foreach ($line in $headers) {
        if ($line -match '^Content-Length:\s*(\d+)\s*$') {
            return [int64]$Matches[1]
        }
    }
    return $null
}

function Remove-PathQuietly([string]$Path) {
    if (-not (Test-Path $Path)) {
        return
    }
    try {
        Remove-Item $Path -Recurse -Force
    } catch {
    }
}

function Test-ZipArchive([string]$Path) {
    if (-not (Test-Path $Path)) {
        return $false
    }
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue | Out-Null
        $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
        try {
            return $archive.Entries.Count -gt 0
        } finally {
            $archive.Dispose()
        }
    } catch {
        return $false
    }
}

function Invoke-DownloadToFile([string]$Url, [string]$DestinationPath) {
    $temporaryPath = "$DestinationPath.partial"
    Remove-PathQuietly $temporaryPath
    Write-Info "Downloading $(Split-Path -Leaf $DestinationPath)"
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    try {
        if ($null -ne $curl) {
            & $curl.Source -L --fail --retry 3 --output $temporaryPath $Url
            if ($LASTEXITCODE -ne 0) {
                Fail "Download failed with exit code $LASTEXITCODE for $Url"
            }
        } else {
            Invoke-WebRequest -Uri $Url -OutFile $temporaryPath
        }
        if (-not (Test-Path $temporaryPath)) {
            Fail "Download did not create the expected file $temporaryPath"
        }
        Move-Item -Path $temporaryPath -Destination $DestinationPath -Force
    } catch {
        Remove-PathQuietly $temporaryPath
        throw
    }
}

function Test-ManagedChromePath([string]$ChromePath) {
    if ([string]::IsNullOrWhiteSpace($ChromePath)) {
        return $false
    }
    return $ChromePath.StartsWith($ManagedChromeDir, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-JavaMajorVersion([string]$JavaExe) {
    if (-not (Test-Path $JavaExe)) {
        return $null
    }
    $versionText = (Get-NativeText $JavaExe @("-version") | Select-Object -First 1)
    if ($versionText -match '"(?<version>\d+)(?:\.(?<minor>\d+))?.*"') {
        return [int]$Matches["version"]
    }
    return $null
}

function Test-JavaHome17([string]$JavaHome) {
    if ([string]::IsNullOrWhiteSpace($JavaHome)) {
        return $false
    }
    $javaExe = Join-Path $JavaHome "bin\java.exe"
    $javacExe = Join-Path $JavaHome "bin\javac.exe"
    $jarExe = Join-Path $JavaHome "bin\jar.exe"
    if (-not ((Test-Path $javaExe) -and (Test-Path $javacExe) -and (Test-Path $jarExe))) {
        return $false
    }
    return (Get-JavaMajorVersion $javaExe) -eq 17
}

function Find-SystemJavaHome() {
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($variableName in @("RECORDER_JAVA_HOME", "JAVA_HOME")) {
        $value = [Environment]::GetEnvironmentVariable($variableName, "Process")
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $candidates.Add($value)
        }
    }
    $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($null -ne $javac) {
        $candidates.Add((Split-Path -Parent (Split-Path -Parent $javac.Source)))
    }
    foreach ($registryPath in @(
        "HKLM:\SOFTWARE\Eclipse Adoptium\JDK",
        "HKLM:\SOFTWARE\JavaSoft\JDK",
        "HKLM:\SOFTWARE\WOW6432Node\Eclipse Adoptium\JDK",
        "HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK"
    )) {
        if (Test-Path $registryPath) {
            foreach ($subKey in Get-ChildItem $registryPath -ErrorAction SilentlyContinue) {
                $properties = Get-ItemProperty $subKey.PSPath -ErrorAction SilentlyContinue
                if ($null -eq $properties) {
                    continue
                }
                foreach ($propertyName in @("Path", "JavaHome")) {
                    $property = $properties.PSObject.Properties[$propertyName]
                    if ($null -ne $property -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
                        $candidates.Add([string]$property.Value)
                    }
                }
            }
        }
    }
    foreach ($candidate in $candidates) {
        if (Test-JavaHome17 $candidate) {
            return $candidate
        }
    }
    return $null
}

function Provision-LocalJdk() {
    $jdkRoot = Join-Path $RuntimeDir "jdk-17"
    if (Test-JavaHome17 $jdkRoot) {
        return $jdkRoot
    }
    Write-Info "Provisioning project-local Temurin JDK 17"
    $apiUrl = "https://api.adoptium.net/v3/assets/latest/17/hotspot?os=windows&architecture=x64&image_type=jdk&jvm_impl=hotspot&vendor=adoptium"
    $assetResponse = Invoke-RestMethod $apiUrl
    $asset = if ($assetResponse -is [array]) { $assetResponse[0] } else { $assetResponse }
    if ($null -eq $asset -or $null -eq $asset.binary -or $null -eq $asset.binary.package) {
        Fail "Could not resolve a Temurin JDK 17 package from Adoptium."
    }
    $zipUrl = $asset.binary.package.link
    $expectedChecksum = [string]$asset.binary.package.checksum
    $zipName = [string]$asset.binary.package.name
    $zipPath = Join-Path $DownloadsDir $zipName
    if (-not (Test-Path $zipPath)) {
        Write-Info "Downloading $zipName"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
    }
    if (-not [string]::IsNullOrWhiteSpace($expectedChecksum)) {
        $actualChecksum = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLowerInvariant()
        if ($actualChecksum -ne $expectedChecksum.ToLowerInvariant()) {
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Fail "Downloaded JDK checksum did not match the Adoptium API response."
        }
    }
    $extractRoot = Join-Path $DownloadsDir "jdk-extract"
    if (Test-Path $extractRoot) {
        Remove-Item $extractRoot -Recurse -Force
    }
    Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
    $extractedHome = Get-ChildItem $extractRoot | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if ($null -eq $extractedHome) {
        Fail "JDK archive extracted without a JDK directory."
    }
    if (Test-Path $jdkRoot) {
        Remove-Item $jdkRoot -Recurse -Force
    }
    Move-Item -Path $extractedHome.FullName -Destination $jdkRoot
    Remove-Item $extractRoot -Recurse -Force
    if (-not (Test-JavaHome17 $jdkRoot)) {
        Fail "Provisioned JDK folder does not contain a working Java 17 JDK."
    }
    return $jdkRoot
}

function Resolve-JavaHome() {
    $systemJavaHome = Find-SystemJavaHome
    if ($null -ne $systemJavaHome) {
        return $systemJavaHome
    }
    return Provision-LocalJdk
}

function Resolve-JavaTools([string]$JavaHome) {
    if (-not (Test-JavaHome17 $JavaHome)) {
        Fail "Java 17 JDK was not resolved correctly: $JavaHome"
    }
    return @{
        JavaHome = $JavaHome
        Java = (Join-Path $JavaHome "bin\java.exe")
        Javac = (Join-Path $JavaHome "bin\javac.exe")
        Jar = (Join-Path $JavaHome "bin\jar.exe")
    }
}

function Resolve-SystemChromePath() {
    $configured = [Environment]::GetEnvironmentVariable("TIM_UI_RECORDER_CHROME_PATH", "Process")
    if (-not [string]::IsNullOrWhiteSpace($configured) -and (Test-Path $configured)) {
        return $configured
    }
    foreach ($candidate in @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    foreach ($registryPath in @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    )) {
        if (Test-Path $registryPath) {
            $item = Get-Item $registryPath -ErrorAction SilentlyContinue
            $path = if ($null -ne $item) { $item.GetValue("") } else { $null }
            if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path $path)) {
                return $path
            }
        }
    }
    $command = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($null -ne $command -and (Test-Path $command.Source)) {
        return $command.Source
    }
    return $null
}

function Resolve-ManagedChromePath() {
    foreach ($candidate in @(
        (Join-Path $ManagedChromeDir "chrome-win64\chrome.exe"),
        (Join-Path $ManagedChromeDir "chrome.exe")
    )) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

function Provision-ChromeForTesting() {
    $managedChrome = Resolve-ManagedChromePath
    if ($null -ne $managedChrome) {
        return $managedChrome
    }
    Write-Info "Provisioning project-local Chrome for Testing"
    $downloads = Invoke-RestMethod "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
    $chromeDownload = $downloads.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq "win64" } | Select-Object -First 1
    if ($null -eq $chromeDownload) {
        Fail "Could not resolve a Windows Chrome for Testing download."
    }
    $stableVersion = [string]$downloads.channels.Stable.version
    if ([string]::IsNullOrWhiteSpace($stableVersion)) {
        $stableVersion = "stable"
    }
    $zipName = "chrome-for-testing-$stableVersion-win64.zip"
    $zipPath = Join-Path $DownloadsDir $zipName
    $expectedLength = Get-RemoteContentLength $chromeDownload.url
    if (Test-Path $zipPath) {
        $zipLooksValid = Test-ZipArchive $zipPath
        if ($null -ne $expectedLength) {
            $localLength = (Get-Item $zipPath).Length
            if ($localLength -ne $expectedLength) {
                $zipLooksValid = $false
            }
        }
        if (-not $zipLooksValid) {
            Remove-PathQuietly $zipPath
        }
    }
    if (-not (Test-Path $zipPath)) {
        Invoke-DownloadToFile $chromeDownload.url $zipPath
        if (-not (Test-ZipArchive $zipPath)) {
            Remove-PathQuietly $zipPath
            Fail "Downloaded Chrome for Testing archive is incomplete or invalid."
        }
    }
    $extractDir = Join-Path $DownloadsDir "chrome-for-testing-extract-$stableVersion"
    Remove-PathQuietly $extractDir
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $candidate = Join-Path $extractDir "chrome-win64"
    if (-not (Test-Path (Join-Path $candidate "chrome.exe"))) {
        $candidate = Get-ChildItem -Path $extractDir -Recurse -Filter chrome.exe | Select-Object -First 1 | ForEach-Object { Split-Path -Parent $_.FullName }
    }
    if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path (Join-Path $candidate "chrome.exe"))) {
        Fail "Chrome for Testing archive did not contain a usable chrome.exe."
    }
    Remove-PathQuietly $ManagedChromeDir
    Move-Item -Path $candidate -Destination $ManagedChromeDir
    Remove-PathQuietly $extractDir
    return (Join-Path $ManagedChromeDir "chrome.exe")
}

function Ensure-ChromePath() {
    $configured = [Environment]::GetEnvironmentVariable("TIM_UI_RECORDER_CHROME_PATH", "Process")
    if (-not [string]::IsNullOrWhiteSpace($configured) -and (Test-Path $configured)) {
        return $configured
    }
    try {
        return Provision-ChromeForTesting
    } catch {
        Write-WarnLine "Chrome for Testing provisioning failed, falling back to system Chrome if available. $($_.Exception.Message)"
    }
    $chromePath = Resolve-SystemChromePath
    if ($null -ne $chromePath) {
        Write-WarnLine "Using installed Chrome without managed Chrome for Testing. Chrome 137+ removed --load-extension in branded builds, so recorder extension auto-loading may be unavailable."
        return $chromePath
    }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($null -eq $winget) {
        Fail "No managed Chrome runtime was available, Chrome for Testing provisioning failed, and winget is not available."
    }
    Write-Info "Google Chrome was not detected. Attempting installation via winget."
    try {
        & $winget.Source install --exact --id Google.Chrome --scope user --silent --accept-package-agreements --accept-source-agreements | Out-Null
    } catch {
        & $winget.Source install --exact --id Google.Chrome --silent --accept-package-agreements --accept-source-agreements | Out-Null
    }
    Start-Sleep -Seconds 5
    $chromePath = Resolve-SystemChromePath
    if ($null -eq $chromePath) {
        Fail "Google Chrome could not be detected after automatic installation."
    }
    return $chromePath
}

function Invoke-Process([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory = $Root) {
    $joined = $Arguments -join " "
    Write-Info "Running: $FilePath $joined"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Fail "Command failed with exit code $($process.ExitCode): $FilePath $joined"
    }
}

function Get-LatestWriteTime([string[]]$Paths) {
    $latest = Get-Date "2000-01-01"
    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            continue
        }
        $items = Get-ChildItem -Path $path -Recurse -File
        foreach ($item in $items) {
            if ($item.LastWriteTime -gt $latest) {
                $latest = $item.LastWriteTime
            }
        }
    }
    return $latest
}

function Test-BuildRequired() {
    if (-not (Test-Path $DistJar)) {
        return $true
    }
    $buildTime = (Get-Item $DistJar).LastWriteTime
    $sourceTime = Get-LatestWriteTime @(
        (Join-Path $Root "recorder-tool\src"),
        (Join-Path $Root "recorder-tool\chrome-extension"),
        (Join-Path $Root "recorder-tool\profiles"),
        (Join-Path $Root "recorder-tool\examples"),
        (Join-Path $Root "scripts"),
        (Join-Path $Root "config"),
        (Join-Path $Root "build-recorder.bat"),
        (Join-Path $Root "run-recorder.bat"),
        (Join-Path $Root "start-recorder.bat")
    )
    return $sourceTime -gt $buildTime
}

function Write-ResponseFile([string]$Path, [string[]]$Values) {
    Set-Content -Path $Path -Value $Values -Encoding ASCII
}

function Invoke-Build([hashtable]$JavaTools) {
    if (-not (Test-BuildRequired)) {
        Write-Info "Build artifacts are up to date"
        return
    }
    Write-Info "Building recorder tool"
    if (Test-Path $BuildDir) {
        Remove-PathQuietly $BuildDir
    }
    if (Test-Path $DistDir) {
        try {
            Remove-Item $DistDir -Recurse -Force -ErrorAction Stop
        } catch {
            Write-WarnLine "Build artifacts are in use. Stopping the managed backend before rebuilding."
            Stop-ProcessFromStateFile $BackendPidFile
            Start-Sleep -Seconds 1
            Remove-Item $DistDir -Recurse -Force -ErrorAction Stop
        }
    }
    Ensure-Directory (Join-Path $BuildDir "classes\main")
    Ensure-Directory (Join-Path $BuildDir "classes\compat")
    Ensure-Directory (Join-Path $BuildDir "classes\test")
    Ensure-Directory (Join-Path $BuildDir "classes\generated")
    Ensure-Directory $DistDir

    $mainSources = Join-Path $BuildDir "main-sources.txt"
    $compatSources = Join-Path $BuildDir "compat-sources.txt"
    $testSources = Join-Path $BuildDir "test-sources.txt"
    $generatedSources = Join-Path $BuildDir "generated-sources.txt"

    Write-ResponseFile $mainSources ((Get-ChildItem -Path (Join-Path $Root "recorder-tool\src\main\java") -Recurse -Filter *.java).FullName)
    Write-ResponseFile $compatSources ((Get-ChildItem -Path (Join-Path $Root "recorder-tool\src\compat\java") -Recurse -Filter *.java).FullName)
    Write-ResponseFile $testSources ((Get-ChildItem -Path (Join-Path $Root "recorder-tool\src\test\java") -Recurse -Filter *.java).FullName)

    Invoke-Process $JavaTools.Javac @("-d", (Join-Path $BuildDir "classes\main"), "@$mainSources")
    Invoke-Process $JavaTools.Javac @("-cp", (Join-Path $BuildDir "classes\main"), "-d", (Join-Path $BuildDir "classes\compat"), "@$compatSources")
    Invoke-Process $JavaTools.Javac @("-cp", (Join-Path $BuildDir "classes\main"), "-d", (Join-Path $BuildDir "classes\test"), "@$testSources")

    Invoke-Process $JavaTools.Java @("-cp", "$(Join-Path $BuildDir "classes\main");$(Join-Path $BuildDir "classes\test")", "com.timbpm.recorder.tests.RecorderToolSelfTest")
    Invoke-Process $JavaTools.Java @("-cp", (Join-Path $BuildDir "classes\main"), "com.timbpm.recorder.Main", "generate", "--scenario", (Join-Path $Root "recorder-tool\examples\nightly-login-candidate-tasknmotion.json"), "--profile", "tim-ui-junit4-selenide", "--class", "NightlyLoginGeneratedTest")

    Write-ResponseFile $generatedSources ((Get-ChildItem -Path (Join-Path $Root "recorder-tool\generated\java") -Recurse -Filter *.java).FullName)
    Invoke-Process $JavaTools.Javac @("-cp", "$(Join-Path $BuildDir "classes\main");$(Join-Path $BuildDir "classes\compat")", "-d", (Join-Path $BuildDir "classes\generated"), "@$generatedSources")

    Invoke-Process $JavaTools.Jar @("--create", "--file", $DistJar, "--main-class", "com.timbpm.recorder.Main", "-C", (Join-Path $BuildDir "classes\main"), ".")

    $extensionZip = Join-Path $DistDir "chrome-extension.zip"
    if (Test-Path $extensionZip) {
        Remove-Item $extensionZip -Force
    }
    Compress-Archive -Path (Join-Path $ExtensionDir "*") -DestinationPath $extensionZip -Force
    Copy-Item -Path $ExtensionDir -Destination (Join-Path $DistDir "chrome-extension") -Recurse -Force
    Write-Info "Build complete"
}

function Invoke-HealthCheck([int]$Port) {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
}

function Wait-ForHttpEndpoint([string]$Url, [int]$TimeoutSeconds = 20) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            return Invoke-RestMethod -Uri $Url -TimeoutSec 5
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $null
}

function Get-JsonFromFile([string]$Path) {
    if (-not (Test-Path $Path)) {
        return $null
    }
    return (Get-Content $Path -Raw | ConvertFrom-Json)
}

function Save-JsonToFile([string]$Path, $Value) {
    $Value | ConvertTo-Json -Depth 8 | Set-Content -Path $Path -Encoding UTF8
}

function Stop-ProcessFromStateFile([string]$StateFile) {
    $state = Get-JsonFromFile $StateFile
    if ($null -eq $state) {
        return
    }
    try {
        $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
        if ($null -ne $process) {
            Stop-Process -Id $state.pid -Force
            try {
                Wait-Process -Id $state.pid -Timeout 10 -ErrorAction SilentlyContinue
            } catch {
            }
        }
    } catch {
    }
    Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
}

function Start-Backend([hashtable]$JavaTools, [int]$Port) {
    $healthUrl = "http://127.0.0.1:$Port/api/health"
    $existingHealth = Wait-ForHttpEndpoint $healthUrl 1
    if ($null -ne $existingHealth) {
        Write-Info "Backend already responding on port $Port"
        return $existingHealth
    }
    Stop-ProcessFromStateFile $BackendPidFile
    $outLog = Join-Path $LogsDir "backend.stdout.log"
    $errLog = Join-Path $LogsDir "backend.stderr.log"
    Remove-Item $outLog -Force -ErrorAction SilentlyContinue
    Remove-Item $errLog -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $JavaTools.Java -ArgumentList @("-jar", $DistJar, "server", $Port) -WorkingDirectory $Root -RedirectStandardInput $DetachedInputFile -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
    Save-JsonToFile $BackendPidFile @{
        pid = $process.Id
        port = $Port
        startedAt = (Get-Date).ToString("o")
        stdoutLog = $outLog
        stderrLog = $errLog
    }
    $health = Wait-ForHttpEndpoint $healthUrl 20
    if ($null -eq $health) {
        $logTail = if (Test-Path $errLog) { (Get-Content $errLog -Tail 40) -join [Environment]::NewLine } else { "" }
        Fail "Backend failed to become healthy on port $Port.`n$logTail"
    }
    Write-Info "Backend ready on http://127.0.0.1:$Port"
    return $health
}

function Get-ChromeDebugInfo([int]$Port) {
    return Wait-ForHttpEndpoint "http://127.0.0.1:$Port/json/version" 1
}

function Get-ChromeTargets([int]$Port) {
    try {
        return @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 5)
    } catch {
        return @()
    }
}

function Get-RecorderExtensionStatus([int]$Port) {
    $status = @{
        extensionLoaded = $false
        panelOpen = $false
        extensionId = $null
    }
    foreach ($target in Get-ChromeTargets $Port) {
        $url = [string]$target.url
        if ($url -like "chrome-extension://*") {
            $status.extensionLoaded = $true
            if ([string]::IsNullOrWhiteSpace($status.extensionId) -and $url -match '^chrome-extension://([^/]+)/') {
                $status.extensionId = $Matches[1]
            }
            if ($url -like "chrome-extension://*/panel.html*") {
                $status.panelOpen = $true
            }
        }
    }
    if (-not $status.extensionLoaded) {
        $localExtensionSettingsDir = Join-Path $ChromeProfileDir "Default\Local Extension Settings"
        if (Test-Path $localExtensionSettingsDir) {
            $extensionIds = @(Get-ChildItem -Path $localExtensionSettingsDir -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
            if ($extensionIds.Count -eq 1) {
                $status.extensionLoaded = $true
                $status.extensionId = $extensionIds[0]
            }
        }
    }
    return $status
}

function Open-RecorderPanel([int]$Port, [string]$ExtensionId) {
    if ([string]::IsNullOrWhiteSpace($ExtensionId)) {
        return $false
    }
    $panelUrl = "chrome-extension://$ExtensionId/panel.html"
    $requestUrl = "http://127.0.0.1:$Port/json/new?" + [System.Uri]::EscapeDataString($panelUrl)
    try {
        Invoke-RestMethod -Method Put -Uri $requestUrl -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        try {
            Invoke-RestMethod -Method Get -Uri $requestUrl -TimeoutSec 5 | Out-Null
            return $true
        } catch {
            return $false
        }
    }
}

function Ensure-RecorderExtensionReady([int]$Port) {
    $deadline = (Get-Date).AddSeconds(20)
    $status = $null
    while ((Get-Date) -lt $deadline) {
        $status = Get-RecorderExtensionStatus $Port
        if ($status.panelOpen) {
            return $status
        }
        if ($status.extensionLoaded -and -not $status.panelOpen) {
            [void](Open-RecorderPanel $Port $status.extensionId)
        }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $status) {
        return @{
            extensionLoaded = $false
            panelOpen = $false
            extensionId = $null
        }
    }
    return $status
  }

function Start-ChromeProcess([string]$ChromePath, [string[]]$Arguments, [switch]$PassThru) {
    $stdoutLog = Join-Path $LogsDir "chrome.stdout.log"
    $stderrLog = Join-Path $LogsDir "chrome.stderr.log"
    Remove-Item $stdoutLog -Force -ErrorAction SilentlyContinue
    Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue

    $processArgs = @{
        FilePath = $ChromePath
        ArgumentList = $Arguments
        WorkingDirectory = $Root
        RedirectStandardInput = $DetachedInputFile
        RedirectStandardOutput = $stdoutLog
        RedirectStandardError = $stderrLog
    }
    if ($PassThru) {
        $processArgs.PassThru = $true
    }

    return Start-Process @processArgs
}

function Start-OrReuseChrome([string]$ChromePath, [int]$DebugPort, [string]$StartUrl) {
    $existing = Get-ChromeDebugInfo $DebugPort
    if ($null -ne $existing) {
        Write-Info "Chrome debugger already responding on port $DebugPort"
        $extensionStatus = Ensure-RecorderExtensionReady $DebugPort
        if (-not $extensionStatus.extensionLoaded) {
            Write-WarnLine "A Chrome debugger session is already using port $DebugPort, but the recorder extension was not detected in that browser."
        } elseif ($extensionStatus.panelOpen) {
            Write-Info "Recorder UI tab is already available in the connected Chrome session"
        }
        Start-ChromeProcess -ChromePath $ChromePath -Arguments @("--user-data-dir=$ChromeProfileDir", $StartUrl) | Out-Null
        return $existing
    }
    Stop-ProcessFromStateFile $ChromePidFile
    $arguments = @(
        "--remote-debugging-port=$DebugPort",
        "--user-data-dir=$ChromeProfileDir",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
        "--new-window",
        "--load-extension=$ExtensionDir",
        $StartUrl
    )
    $managedChrome = Test-ManagedChromePath $ChromePath
    if ($managedChrome) {
        Write-Info "Launching managed Chrome for Testing with the recorder extension preloaded"
    } else {
        Write-Info "Launching installed Chrome with remote debugging"
    }
    $process = Start-ChromeProcess -ChromePath $ChromePath -Arguments $arguments -PassThru
    Save-JsonToFile $ChromePidFile @{
        pid = $process.Id
        port = $DebugPort
        startedAt = (Get-Date).ToString("o")
        userDataDir = $ChromeProfileDir
        startUrl = $StartUrl
        chromePath = $ChromePath
        managedChrome = $managedChrome
        stdoutLog = (Join-Path $LogsDir "chrome.stdout.log")
        stderrLog = (Join-Path $LogsDir "chrome.stderr.log")
    }
    $debugInfo = Wait-ForHttpEndpoint "http://127.0.0.1:$DebugPort/json/version" 20
    if ($null -eq $debugInfo) {
        Fail "Chrome did not expose the remote debugging endpoint on port $DebugPort."
    }
    $extensionStatus = Ensure-RecorderExtensionReady $DebugPort
    if ($extensionStatus.panelOpen) {
        Write-Info "Recorder UI tab opened automatically in Chrome"
    } elseif ($extensionStatus.extensionLoaded) {
        Write-WarnLine "Recorder extension loaded, but the panel page could not be opened automatically."
    } else {
        if ($managedChrome) {
            Write-WarnLine "Managed Chrome started, but the recorder extension still did not appear. Check the browser window for extension load errors."
        } else {
            Write-WarnLine "Installed Chrome started, but the recorder extension was not detected. Chrome 137+ branded builds removed --load-extension, so managed Chrome for Testing is required for automatic extension startup."
        }
    }
    return $debugInfo
}

function Ensure-NightlyCredentials() {
    $username = [Environment]::GetEnvironmentVariable("TIM_UI_RECORDER_USERNAME", "Process")
    $password = [Environment]::GetEnvironmentVariable("TIM_UI_RECORDER_PASSWORD", "Process")
    if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
        Fail "Nightly credentials are missing. Set TIM_UI_RECORDER_USERNAME and TIM_UI_RECORDER_PASSWORD in the environment or config\recorder.local.properties."
    }
}

function Resolve-ScenarioPath([string]$PathValue) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }
    return (Join-Path $Root $PathValue)
}

function Save-RuntimeState([hashtable]$State) {
    Save-JsonToFile $RuntimeStateFile $State
}

function Invoke-JavaMain([hashtable]$JavaTools, [string[]]$Arguments) {
    Invoke-Process $JavaTools.Java $Arguments
}

Ensure-ProjectScaffolding
Ensure-ConfigFiles
$configProperties = Read-PropertiesFile $ConfigFile
Apply-LocalConfiguration $configProperties

$effectiveServerPort = if ($ServerPort -gt 0) { $ServerPort } else { [int](Resolve-Setting $configProperties "TIM_UI_RECORDER_SERVER_PORT" "17845") }
$effectiveChromeDebugPort = if ($ChromeDebugPort -gt 0) { $ChromeDebugPort } else { [int](Resolve-Setting $configProperties "TIM_UI_RECORDER_CHROME_DEBUG_PORT" "9222") }
$startUrl = Resolve-Setting $configProperties "TIM_UI_RECORDER_LOGIN_URL" "https://nightly.tim-bpm.com/tim/client/login"
$javaTools = Resolve-JavaTools (Resolve-JavaHome)
$chromePath = $null

switch ($Command.ToLowerInvariant()) {
    "doctor" {
        $chromePath = Resolve-SystemChromePath
        $managedChromePath = Resolve-ManagedChromePath
        $health = Wait-ForHttpEndpoint "http://127.0.0.1:$effectiveServerPort/api/health" 1
        $chromeDebug = if ($effectiveChromeDebugPort -gt 0) { Get-ChromeDebugInfo $effectiveChromeDebugPort } else { $null }
        $extensionStatus = if ($null -ne $chromeDebug) { Get-RecorderExtensionStatus $effectiveChromeDebugPort } else { @{ extensionLoaded = $false; panelOpen = $false; extensionId = $null } }
        $manifest = if (Test-Path (Join-Path $ExtensionDir "manifest.json")) { Get-Content (Join-Path $ExtensionDir "manifest.json") -Raw | ConvertFrom-Json } else { $null }
        $manifestPermissions = if ($null -ne $manifest) { @($manifest.permissions) } else { @() }
        $hostPermissions = if ($null -ne $manifest) { @($manifest.host_permissions) } else { @() }
        $backgroundScriptPath = Join-Path $ExtensionDir "background.js"
        $backgroundScriptText = if (Test-Path $backgroundScriptPath) { Get-Content $backgroundScriptPath -Raw } else { "" }
        $report = @{
            root = $Root
            javaHome = $javaTools.JavaHome
            javaVersion = (Get-NativeText $javaTools.Java @("-version") | Select-Object -First 1)
            systemChromePath = $chromePath
            managedChromePath = $managedChromePath
            preferredChromePath = if ($null -ne $managedChromePath) { $managedChromePath } else { $chromePath }
            configFile = $ConfigFile
            serverPort = $effectiveServerPort
            chromeDebugPort = $effectiveChromeDebugPort
            backendHealthy = ($null -ne $health)
            chromeDebugReachable = ($null -ne $chromeDebug)
            recorderExtensionLoaded = [bool]$extensionStatus.extensionLoaded
            recorderPanelOpen = [bool]$extensionStatus.panelOpen
            distJar = (Test-Path $DistJar)
            manifestTabsPermission = ($manifestPermissions -contains "tabs")
            manifestActiveTabPermission = ($manifestPermissions -contains "activeTab")
            manifestScriptingPermission = ($manifestPermissions -contains "scripting")
            manifestHostPermissions = $hostPermissions
            backgroundScriptLoaded = [bool]$extensionStatus.extensionLoaded
            startNewTestHandlerRegistered = ($backgroundScriptText -match "case 'START_NEW_TEST'" -and $backgroundScriptText -match 'async function startNewTest')
            tabCreationAvailable = ($backgroundScriptText -match 'chrome\.tabs\.create')
        }
        $report | ConvertTo-Json -Depth 6
        break
    }
    "build" {
        Invoke-Build $javaTools
        break
    }
    "server" {
        if (-not $SkipBuild) {
            Invoke-Build $javaTools
        }
        Invoke-JavaMain $javaTools @("-jar", $DistJar, "server", "$effectiveServerPort")
        break
    }
    "validate" {
        if (-not $SkipBuild) {
            Invoke-Build $javaTools
        }
        $scenarioPath = Resolve-ScenarioPath $Scenario
        Invoke-JavaMain $javaTools @("-jar", $DistJar, "validate", "--scenario", $scenarioPath)
        break
    }
    "generate" {
        if (-not $SkipBuild) {
            Invoke-Build $javaTools
        }
        $scenarioPath = Resolve-ScenarioPath $Scenario
        Invoke-JavaMain $javaTools @("-jar", $DistJar, "generate", "--scenario", $scenarioPath, "--profile", $Profile, "--class", $ClassName)
        break
    }
    "replay" {
        if (-not $SkipBuild) {
            Invoke-Build $javaTools
        }
        Ensure-NightlyCredentials
        $scenarioPath = Resolve-ScenarioPath $Scenario
        $javaArguments = @("-jar", $DistJar, "replay", "--scenario", $scenarioPath, "--startIndex", "0")
        if ($Headless) {
            $javaArguments += @("--headless", "true")
        } else {
            $chromePath = Ensure-ChromePath
            Start-OrReuseChrome $chromePath $effectiveChromeDebugPort $startUrl | Out-Null
            $javaArguments += @("--headless", "false", "--debugPort", "$effectiveChromeDebugPort")
        }
        Invoke-JavaMain $javaTools $javaArguments
        break
    }
    "stop" {
        Stop-ProcessFromStateFile $BackendPidFile
        Stop-ProcessFromStateFile $ChromePidFile
        Write-Info "Stopped managed recorder processes"
        break
    }
    default {
        if (-not $SkipBuild) {
            Invoke-Build $javaTools
        }
        $health = Start-Backend $javaTools $effectiveServerPort
        if (-not $SkipChrome) {
            $chromePath = Ensure-ChromePath
            $debug = Start-OrReuseChrome $chromePath $effectiveChromeDebugPort $startUrl
        }
        Save-RuntimeState @{
            root = $Root
            serverPort = $effectiveServerPort
            chromeDebugPort = $effectiveChromeDebugPort
            startUrl = $startUrl
            backendHealth = $health
            chromePath = $chromePath
            managedChrome = if ([string]::IsNullOrWhiteSpace($chromePath)) { $false } else { Test-ManagedChromePath $chromePath }
            startedAt = (Get-Date).ToString("o")
        }
        Write-Info "Ready"
        Write-Info "Backend: http://127.0.0.1:$effectiveServerPort/api/health"
        if (-not $SkipChrome) {
            Write-Info "Chrome binary: $chromePath"
            Write-Info "Chrome debug endpoint: http://127.0.0.1:$effectiveChromeDebugPort/json/version"
            Write-Info "Chrome profile: $ChromeProfileDir"
        }
        Write-Info "Local config: $ConfigFile"
        break
    }
}
