param(
    [string]$Root = "C:\dev\uitool",
    [string]$RunName = "20260402-000000-step-id-revalidation",
    [int]$ChromeDebugPort = 9222,
    [int]$FixturePort = 17846,
    [switch]$SkipRuntimeStart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RunDir = Join-Path $Root ("testingtheapp\runs\" + $RunName)
$ScreenshotsDir = Join-Path $RunDir "screenshots"
$LogsDir = Join-Path $RunDir "logs"
$NotesDir = Join-Path $RunDir "notes"
$FixtureDir = Join-Path $Root "testingtheapp\fixtures"
$FixtureUrl = "http://127.0.0.1:$FixturePort/recorder-test-page.html"
$CommandsLog = Join-Path $LogsDir "commands.txt"
$RunLog = Join-Path $LogsDir "step-id-revalidation.log"
$ChecklistPath = Join-Path $NotesDir "validation-checklist.md"
$ResultsPath = Join-Path $NotesDir "results.md"
$SummaryPath = Join-Path $LogsDir "summary.json"
$FixtureServerPidPath = Join-Path $LogsDir "fixture-server.pid"
$StartRecorderBat = Join-Path $Root "start-recorder.bat"
$RecorderBootstrapScript = Join-Path $Root "scripts\recorder-bootstrap.ps1"
$script:nextCdpId = 0
$script:ExtensionId = $null

$scenarioName = "Step Id Revalidation $RunName"
$scenarioFileName = (($scenarioName -replace '[^a-zA-Z0-9-_]+', '-') -replace '-+', '-').Trim('-').ToLowerInvariant() + '.json'
$javaClassName = ("StepIdRevalidation" + (($RunName -replace '[^0-9]', '')) + "GeneratedTest")

New-Item -ItemType Directory -Force -Path $ScreenshotsDir, $LogsDir, $NotesDir | Out-Null
Set-Content -Path $CommandsLog -Value '' -Encoding UTF8
Set-Content -Path $RunLog -Value '' -Encoding UTF8

$script:Results = [ordered]@{
    Environment = [ordered]@{
        Label = "Environment / setup"
        Goal = "Reuse or start the recorder runtime, verify backend health, open the panel, and build a mixed live test with recorded actions plus a manual assertion."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    Replay = [ordered]@{
        Label = "Replay"
        Goal = "Replay the mixed live scenario end to end with direct evidence of running, progress, and final result."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    Save = [ordered]@{
        Label = "Save"
        Goal = "Save the repaired live-authored scenario and confirm persistence directly."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    GenerateJava = [ordered]@{
        Label = "Generate Java"
        Goal = "Generate Java from the repaired live-authored scenario and confirm the output file exists."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
}

function Write-RunLog([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date).ToString('u'), $Message
    Add-Content -Path $RunLog -Value $line -Encoding UTF8
    Add-Content -Path $CommandsLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Add-CommandRecord([string]$CommandText) {
    $line = "[{0}] COMMAND {1}" -f (Get-Date).ToString('u'), $CommandText
    Add-Content -Path $CommandsLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Add-ResultStep([string]$Key, [string]$Text) {
    $script:Results[$Key].Steps.Add($Text)
    Write-RunLog ("{0}: {1}" -f $script:Results[$Key].Label, $Text)
}

function Add-ResultNote([string]$Key, [string]$Text) {
    $script:Results[$Key].Notes.Add($Text)
    Write-RunLog ("{0} note: {1}" -f $script:Results[$Key].Label, $Text)
}

function Add-ResultEvidence([string]$Key, [string]$RelativePath) {
    $script:Results[$Key].Evidence.Add($RelativePath)
}

function Set-ResultStatus([string]$Key, [string]$Status, [string]$NextAction = "") {
    $script:Results[$Key].Status = $Status
    $script:Results[$Key].NextAction = $NextAction
}

function Save-Json([string]$Path, $Value) {
    $Value | ConvertTo-Json -Depth 12 | Set-Content -Path $Path -Encoding UTF8
}

function Save-Text([string]$Path, [string]$Value) {
    Set-Content -Path $Path -Value $Value -Encoding UTF8
}

function Wait-ForHttp([string]$Url, [int]$TimeoutSeconds = 20) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        } catch {
            Start-Sleep -Milliseconds 300
        }
    }
    throw "Timed out waiting for $Url"
}

function Invoke-RecorderCommand([string[]]$Arguments, [string]$OutputPath) {
    $commandText = ".\start-recorder.bat " + ($Arguments -join " ")
    Add-CommandRecord $commandText
    $stdoutPath = Join-Path $LogsDir ("recorder-command-" + [guid]::NewGuid().ToString("N") + ".stdout.log")
    $stderrPath = Join-Path $LogsDir ("recorder-command-" + [guid]::NewGuid().ToString("N") + ".stderr.log")
    try {
        $argumentList = @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            $RecorderBootstrapScript
        ) + $Arguments
        $runtimeStatePath = Join-Path $Root ".runtime\runtime-state.json"

        if ($Arguments.Count -eq 0) {
            $previousRuntimeWrite = if (Test-Path $runtimeStatePath) {
                (Get-Item $runtimeStatePath).LastWriteTimeUtc
            } else {
                Get-Date "2000-01-01"
            }

            $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -WindowStyle Hidden
            $deadline = (Get-Date).AddMinutes(3)
            $runtimeReady = $false

            while ((Get-Date) -lt $deadline) {
                if (Test-Path $runtimeStatePath) {
                    $runtimeItem = Get-Item $runtimeStatePath
                    if ($runtimeItem.LastWriteTimeUtc -gt $previousRuntimeWrite) {
                        $runtimeReady = $true
                        break
                    }
                }

                $process.Refresh()
                if ($process.HasExited) {
                    break
                }

                Start-Sleep -Milliseconds 500
            }

            if ($runtimeReady) {
                Wait-ForHttp "http://127.0.0.1:17845/api/health" 90 | Out-Null
                Wait-ForHttp "http://127.0.0.1:$ChromeDebugPort/json/version" 90 | Out-Null
                if (-not $process.HasExited) {
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                }
            }
        } else {
            $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru -WindowStyle Hidden
            $runtimeReady = $true
        }

        $lines = @()
        if (Test-Path $stdoutPath) {
            $lines += Get-Content -Path $stdoutPath
        }
        if (Test-Path $stderrPath) {
            $lines += Get-Content -Path $stderrPath
        }

        $lines | Set-Content -Path $OutputPath -Encoding UTF8
        if (-not $runtimeReady) {
            throw "Command timed out: $commandText"
        }
        if ($Arguments.Count -gt 0 -and $process.ExitCode -ne 0) {
            throw "Command failed: $commandText"
        }
        return $lines
    } finally {
        Remove-Item $stdoutPath -Force -ErrorAction SilentlyContinue
        Remove-Item $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Start-FixtureServer() {
    $serverScript = Join-Path $Root "testingtheapp\logs\serve-fixture.ps1"
    Add-CommandRecord "powershell -File testingtheapp\\logs\\serve-fixture.ps1 -Port $FixturePort -Root testingtheapp\\fixtures"
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $serverScript,
        "-Port",
        "$FixturePort",
        "-Root",
        $FixtureDir
    ) -PassThru -WindowStyle Hidden
    Set-Content -Path $FixtureServerPidPath -Value $process.Id -Encoding ASCII
    Wait-ForHttp $FixtureUrl 20 | Out-Null
    Write-RunLog "Fixture server ready at $FixtureUrl (pid $($process.Id))"
}

function Stop-FixtureServer() {
    if (-not (Test-Path $FixtureServerPidPath)) {
        return
    }
    $pidText = Get-Content $FixtureServerPidPath -ErrorAction SilentlyContinue
    if ($pidText) {
        $process = Get-Process -Id $pidText -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $process.Id -Force
            Write-RunLog "Stopped fixture server pid $($process.Id)"
        }
    }
    Remove-Item $FixtureServerPidPath -Force -ErrorAction SilentlyContinue
}

function Get-ChromeTargets() {
    Wait-ForHttp "http://127.0.0.1:$ChromeDebugPort/json/version" 20 | Out-Null
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$ChromeDebugPort/json/list" -TimeoutSec 5
    if ($null -ne $response -and $response.PSObject.Properties.Name -contains 'value') {
        return @($response.value)
    }
    return @($response)
}

function Find-ExtensionId() {
    foreach ($target in Get-ChromeTargets) {
        $match = [System.Text.RegularExpressions.Regex]::Match([string]$target.url, '^chrome-extension://([^/]+)/')
        if ($match.Success) {
            return $match.Groups[1].Value
        }
    }
    throw 'Recorder extension id could not be determined'
}

function Open-NewTarget([string]$Url) {
    $requestUrl = "http://127.0.0.1:$ChromeDebugPort/json/new?" + [System.Uri]::EscapeDataString($Url)
    try {
        return Invoke-RestMethod -Method Put -Uri $requestUrl -TimeoutSec 5
    } catch {
        return Invoke-RestMethod -Method Get -Uri $requestUrl -TimeoutSec 5
    }
}

function Get-PanelTarget([string]$ExtensionId) {
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        $target = Get-ChromeTargets | Where-Object {
            $_.type -eq 'page' -and $_.url -eq "chrome-extension://$ExtensionId/panel.html"
        } | Select-Object -First 1
        if ($target) {
            return $target
        }
        try {
            Open-NewTarget ("chrome-extension://$ExtensionId/panel.html") | Out-Null
        } catch {
        }
        Start-Sleep -Milliseconds 300
    }
    throw 'Recorder panel target was not found'
}

function Get-PageTargetByUrl([string]$Pattern) {
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        $target = Get-ChromeTargets | Where-Object {
            $_.type -eq 'page' -and $_.url -like $Pattern
        } | Select-Object -First 1
        if ($target) {
            return $target
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Page target was not found for pattern $Pattern"
}

function New-CdpSession([string]$WebSocketUrl) {
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $socket.ConnectAsync([Uri]$WebSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    return $socket
}

function Read-CdpMessage([System.Net.WebSockets.ClientWebSocket]$Socket, [int]$TimeoutSeconds = 20) {
    $buffer = New-Object byte[] 65536
    $segment = [ArraySegment[byte]]::new($buffer)
    $stream = [System.IO.MemoryStream]::new()
    $cancellation = [Threading.CancellationTokenSource]::new()
    $cancellation.CancelAfter([TimeSpan]::FromSeconds($TimeoutSeconds))
    try {
        do {
            $result = $Socket.ReceiveAsync($segment, $cancellation.Token).GetAwaiter().GetResult()
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw 'CDP websocket closed unexpectedly'
            }
            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)
        return [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
    } finally {
        $cancellation.Dispose()
        $stream.Dispose()
    }
}

function Invoke-Cdp([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$Method, $Params = $null) {
    $script:nextCdpId += 1
    $messageId = $script:nextCdpId
    $payload = [ordered]@{ id = $messageId; method = $Method }
    if ($null -ne $Params) {
        $payload.params = $Params
    }
    $json = $payload | ConvertTo-Json -Depth 30 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [ArraySegment[byte]]::new($bytes)
    $null = $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    while ($true) {
        $message = (Read-CdpMessage $Socket) | ConvertFrom-Json
        if ($message.PSObject.Properties.Name -contains 'id' -and $message.id -eq $messageId) {
            if ($message.PSObject.Properties.Name -contains 'error') {
                throw ("CDP error for {0}: {1}" -f $Method, $message.error.message)
            }
            return $message.result
        }
    }
}

function Enable-CdpPage([System.Net.WebSockets.ClientWebSocket]$Socket) {
    Invoke-Cdp $Socket 'Page.enable' @{} | Out-Null
    Invoke-Cdp $Socket 'Runtime.enable' @{} | Out-Null
    Invoke-Cdp $Socket 'Page.bringToFront' @{} | Out-Null
}

function Invoke-CdpEval([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$Expression) {
    $result = Invoke-Cdp $Socket 'Runtime.evaluate' @{
        expression = $Expression
        awaitPromise = $true
        returnByValue = $true
        userGesture = $true
    }
    if ($result.PSObject.Properties.Name -contains 'exceptionDetails' -and $result.exceptionDetails) {
        throw "Runtime.evaluate failed: $($result.exceptionDetails.text)"
    }
    if ($result.PSObject.Properties.Name -contains 'result' -and $result.result.PSObject.Properties.Name -contains 'value') {
        return $result.result.value
    }
    return $result.result
}

function Wait-ForEval([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$Expression, [int]$TimeoutSeconds = 15, [string]$Description = 'condition') {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $value = Invoke-CdpEval $Socket $Expression
        if ($value) {
            return $value
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for $Description"
}

function To-JsLiteral([string]$Value) {
    return ($Value | ConvertTo-Json -Compress)
}

function Set-InputValue([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId, [string]$Value) {
    $valueLiteral = To-JsLiteral $Value
    $idLiteral = To-JsLiteral $ElementId
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById($idLiteral);
  if (!element) throw new Error('Missing element ' + $idLiteral);
  element.focus();
  element.value = $valueLiteral;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
"@ | Out-Null
}

function Set-SelectValue([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId, [string]$Value) {
    $valueLiteral = To-JsLiteral $Value
    $idLiteral = To-JsLiteral $ElementId
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById($idLiteral);
  if (!element) throw new Error('Missing element ' + $idLiteral);
  element.value = $valueLiteral;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value;
})()
"@ | Out-Null
}

function Click-ElementById([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId) {
    $idLiteral = To-JsLiteral $ElementId
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById($idLiteral);
  if (!element) throw new Error('Missing element ' + $idLiteral);
  element.click();
  return true;
})()
"@ | Out-Null
}

function Capture-TargetScreenshot([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$FileName) {
    $path = Join-Path $ScreenshotsDir $FileName
    $metrics = Invoke-Cdp $Socket 'Page.getLayoutMetrics' @{}
    $contentMetrics = if ($metrics.cssContentSize) { $metrics.cssContentSize } elseif ($metrics.contentSize) { $metrics.contentSize } else { $null }
    $contentWidth = if ($contentMetrics) { [int][Math]::Ceiling([double]$contentMetrics.width) } else { 1280 }
    $contentHeight = if ($contentMetrics) { [int][Math]::Ceiling([double]$contentMetrics.height) } else { 960 }
    if ($contentWidth -lt 1280) { $contentWidth = 1280 }
    if ($contentHeight -lt 960) { $contentHeight = 960 }
    Invoke-Cdp $Socket 'Emulation.setDeviceMetricsOverride' @{
        width = $contentWidth
        height = $contentHeight
        deviceScaleFactor = 1
        mobile = $false
    } | Out-Null
    $capture = Invoke-Cdp $Socket 'Page.captureScreenshot' @{ format = 'png'; fromSurface = $true; captureBeyondViewport = $true }
    [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($capture.data))
    Write-RunLog "Saved screenshot $path"
    return ("screenshots/" + $FileName)
}

function Install-PanelHooks([System.Net.WebSockets.ClientWebSocket]$Socket) {
    Invoke-CdpEval $Socket @"
(() => {
  if (!window.__stepIdRevalidationHooksInstalled) {
    window.__stepIdRevalidationHooksInstalled = true;
    window.__stepIdRevalidation = { alerts: [] };
    window.alert = (message) => {
      window.__stepIdRevalidation.alerts.push({
        message: String(message || ''),
        timestamp: new Date().toISOString()
      });
    };
  }
  return true;
})()
"@ | Out-Null
}

function Save-PanelSnapshot([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$FileName) {
    $snapshot = Invoke-CdpEval $Socket @"
(() => ({
  statusReplay: document.getElementById('statusReplay')?.innerText || '',
  replaySummary: document.getElementById('replaySummary')?.innerText || '',
  replayError: document.getElementById('replayError')?.innerText || '',
  playbackLog: document.getElementById('playbackLog')?.innerText || '',
  statusAttachedTab: document.getElementById('statusAttachedTab')?.innerText || '',
  statusRecording: document.getElementById('statusRecording')?.innerText || '',
  stepCount: document.querySelectorAll('.step-card').length,
  alerts: window.__stepIdRevalidation?.alerts || [],
  stepIds: (currentState?.scenario?.orderedSteps || []).map((step, index) => ({
    index: index + 1,
    id: step.id,
    type: step.type,
    stage: step.stage,
    origin: step.origin || ''
  }))
}))()
"@
    $path = Join-Path $LogsDir $FileName
    Save-Json $path $snapshot
    return ("logs/" + $FileName)
}

function Write-ChecklistMarkdown() {
    @"
# Step Id Revalidation Checklist

- [ ] Environment / setup
- [ ] Replay
- [ ] Save
- [ ] Generate Java
"@ | Set-Content -Path $ChecklistPath -Encoding UTF8
}

function Write-ResultsMarkdown() {
    $table = @(
        '| Flow | Status | Evidence |',
        '| --- | --- | --- |'
    )
    foreach ($key in @('Environment', 'Replay', 'Save', 'GenerateJava')) {
        $item = $script:Results[$key]
        $evidence = if ($item.Evidence.Count) { ($item.Evidence -join '<br>') } else { 'Pending' }
        $table += "| $($item.Label) | $($item.Status) | $evidence |"
    }

    $sections = [System.Collections.Generic.List[string]]::new()
    $sections.Add('# Step Id Revalidation Results')
    $sections.Add('')
    $sections.Add("Run folder: testingtheapp/runs/$RunName")
    $sections.Add('')
    $sections.Add('## Summary')
    $sections.Add('')
    foreach ($line in $table) {
        $sections.Add([string]$line)
    }
    foreach ($key in @('Environment', 'Replay', 'Save', 'GenerateJava')) {
        $item = $script:Results[$key]
        $sections.Add('')
        $sections.Add("## $($item.Label)")
        $sections.Add('')
        $sections.Add('Goal:')
        $sections.Add($item.Goal)
        $sections.Add('')
        $sections.Add('Steps attempted:')
        if ($item.Steps.Count) {
            foreach ($step in $item.Steps) { $sections.Add("- $step") }
        } else {
            $sections.Add('Pending.')
        }
        $sections.Add('')
        $sections.Add("Result: $($item.Status)")
        $sections.Add('')
        $sections.Add('Evidence files:')
        if ($item.Evidence.Count) {
            foreach ($evidence in $item.Evidence) { $sections.Add("- $evidence") }
        } else {
            $sections.Add('Pending.')
        }
        $sections.Add('')
        $sections.Add('Notes:')
        if ($item.Notes.Count) {
            foreach ($note in $item.Notes) { $sections.Add("- $note") }
        } else {
            $sections.Add('None.')
        }
        $sections.Add('')
        $sections.Add('Next action if failed or blocked:')
        if ([string]::IsNullOrWhiteSpace($item.NextAction)) {
            $sections.Add('None.')
        } else {
            $sections.Add($item.NextAction)
        }
    }
    $sections | Set-Content -Path $ResultsPath -Encoding UTF8
}

try {
    Write-ChecklistMarkdown
    Start-FixtureServer

    if (-not $SkipRuntimeStart) {
        Invoke-RecorderCommand @("stop") (Join-Path $LogsDir "01-start-recorder-stop.log") | Out-Null
        Invoke-RecorderCommand @() (Join-Path $LogsDir "02-start-recorder-start.log") | Out-Null
        Add-ResultStep "Environment" "Stopped any previous managed recorder runtime and started a fresh backend plus managed Chrome session."
        Add-ResultEvidence "Environment" "logs/01-start-recorder-stop.log"
        Add-ResultEvidence "Environment" "logs/02-start-recorder-start.log"
    } else {
        Add-CommandRecord ".\start-recorder.bat <skipped; reusing existing runtime>"
        Save-Json (Join-Path $LogsDir "02-runtime-state-reused.json") @{
            reusedRuntime = $true
            capturedAt = (Get-Date).ToString('o')
        }
        Add-ResultStep "Environment" "Reused the already-running managed backend and Chrome session."
        Add-ResultEvidence "Environment" "logs/02-runtime-state-reused.json"
    }

    $doctorOutput = Invoke-RecorderCommand @("doctor") (Join-Path $LogsDir "03-doctor-output.txt")
    $doctorJson = ($doctorOutput -join [Environment]::NewLine) | ConvertFrom-Json
    Save-Json (Join-Path $LogsDir "03-doctor-output.json") $doctorJson
    Add-ResultEvidence "Environment" "logs/03-doctor-output.json"
    if (-not $doctorJson.backendHealthy -or -not $doctorJson.recorderExtensionLoaded) {
        throw 'Recorder doctor did not report a healthy backend and loaded recorder extension.'
    }

    $backendHealth = Invoke-RestMethod -Uri "http://127.0.0.1:17845/api/health" -TimeoutSec 5
    Save-Json (Join-Path $LogsDir "04-backend-health.json") $backendHealth
    Add-ResultEvidence "Environment" "logs/04-backend-health.json"

    $script:ExtensionId = Find-ExtensionId
    Save-Json (Join-Path $LogsDir "05-extension-status.json") @{
        extensionId = $script:ExtensionId
        capturedAt = (Get-Date).ToString('o')
    }
    Add-ResultEvidence "Environment" "logs/05-extension-status.json"

    $panelTarget = Get-PanelTarget $script:ExtensionId
    $panelSocket = New-CdpSession $panelTarget.webSocketDebuggerUrl
    try {
        Enable-CdpPage $panelSocket
        Install-PanelHooks $panelSocket

        Wait-ForEval $panelSocket "(() => document.getElementById('backendState').innerText.toLowerCase().includes('online'))()" 20 'backend online panel state' | Out-Null
        Set-InputValue $panelSocket 'startUrl' $FixtureUrl
        Set-InputValue $panelSocket 'scenarioName' $scenarioName
        Set-InputValue $panelSocket 'javaClassName' $javaClassName
        Add-ResultEvidence "Environment" (Capture-TargetScreenshot $panelSocket '01-panel-initial-state.png')
        Add-ResultEvidence "Environment" (Save-PanelSnapshot $panelSocket '06-panel-initial-state.json')

        Click-ElementById $panelSocket 'startNewTest'
        Wait-ForEval $panelSocket "(() => document.getElementById('statusAttachedTab').innerText.includes('Attached'))()" 20 'attached controlled tab' | Out-Null
        Wait-ForEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('On') || document.getElementById('recordingModePill').innerText.includes('Recording'))()" 20 'recording on after new test' | Out-Null
        $fixtureTarget = Get-PageTargetByUrl "$FixtureUrl*"

        $panelSocket.Dispose()
        $panelSocket = $null
        $panelTarget = Get-PanelTarget $script:ExtensionId
        $panelSocket = New-CdpSession $panelTarget.webSocketDebuggerUrl
        Enable-CdpPage $panelSocket
        Install-PanelHooks $panelSocket
        Wait-ForEval $panelSocket "(() => document.getElementById('statusAttachedTab').innerText.includes('Attached'))()" 20 'attached state after panel reconnect' | Out-Null
        Add-ResultEvidence "Environment" (Capture-TargetScreenshot $panelSocket '02-after-start-new-test.png')

        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Set-InputValue $fixtureSocket 'usernameInput' 'alice'
            Click-ElementById $fixtureSocket 'loginBtn'
            Wait-ForEval $fixtureSocket "(() => document.getElementById('message').innerText.includes('alice'))()" 10 'fixture login result' | Out-Null
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 3)()" 15 'recorded steps' | Out-Null
        Click-ElementById $panelSocket 'stopRecording'
        Wait-ForEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('Off'))()" 10 'recording off after recorded actions' | Out-Null

        Click-ElementById $panelSocket 'assertionMode'
        Wait-ForEval $panelSocket "(() => !document.getElementById('assertionComposer').classList.contains('hidden'))()" 10 'assertion composer open' | Out-Null
        Click-ElementById $panelSocket 'pickAssertionTarget'
        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Click-ElementById $fixtureSocket 'message'
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.getElementById('assertionTargetValue').value.trim().length > 0)()" 10 'picked assertion target' | Out-Null
        Set-SelectValue $panelSocket 'assertionTypeSelect' 'assert_text_equals'
        Set-InputValue $panelSocket 'assertionExpectedValue' 'Logged in as alice'
        Click-ElementById $panelSocket 'createAssertion'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 4)()" 15 'manual assertion step' | Out-Null
        Add-ResultStep "Environment" "Built a mixed live scenario with recorded navigate/type/click steps plus a manual assertion step."
        Add-ResultEvidence "Environment" (Capture-TargetScreenshot $panelSocket '03-recorded-steps-and-assertion.png')
        Add-ResultEvidence "Environment" (Save-PanelSnapshot $panelSocket '07-live-scenario-state.json')

        $stepIdSnapshot = Invoke-CdpEval $panelSocket "(() => (currentState?.scenario?.orderedSteps || []).map((step, index) => ({ index: index + 1, id: step.id, type: step.type, stage: step.stage, origin: step.origin || '' })))()"
        Save-Json (Join-Path $LogsDir "08-step-id-snapshot.json") $stepIdSnapshot
        Add-ResultEvidence "Environment" "logs/08-step-id-snapshot.json"
        if (@($stepIdSnapshot | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.id) }).Count -gt 0) {
            throw 'One or more live scenario steps still had a blank id after recording and manual assertion authoring.'
        }
        Set-ResultStatus "Environment" "VERIFIED"

        Click-ElementById $panelSocket 'replayAll'
        Wait-ForEval $panelSocket "(() => document.getElementById('statusReplay').innerText.toLowerCase().includes('running'))()" 20 'replay running' | Out-Null
        Add-ResultStep "Replay" "Started live replay from the panel on the repaired mixed scenario."
        Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '04-replay-running.png')

        Start-Sleep -Milliseconds 400
        if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('pausePlayback').disabled)()") {
            Click-ElementById $panelSocket 'pausePlayback'
            try {
                Wait-ForEval $panelSocket "(() => /paused|failed|completed/i.test(document.getElementById('statusReplay').innerText))()" 10 'replay paused' | Out-Null
            } catch {
                Add-ResultNote "Replay" "Replay progressed too quickly to hold a paused state for the progress capture."
            }
        }
        Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '05-replay-progress.png')
        if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('resumePlayback').disabled)()") {
            Click-ElementById $panelSocket 'resumePlayback'
        }

        Wait-ForEval $panelSocket "(() => /completed|failed|stopped/i.test(document.getElementById('statusReplay').innerText) || document.getElementById('replayError').innerText.trim().length > 0)()" 40 'replay final state' | Out-Null
        Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '06-replay-result.png')
        Add-ResultEvidence "Replay" (Save-PanelSnapshot $panelSocket '10-replay-state.json')
        $replaySnapshot = Get-Content (Join-Path $LogsDir "10-replay-state.json") -Raw | ConvertFrom-Json
        if ($replaySnapshot.statusReplay -match 'Completed' -and [string]::IsNullOrWhiteSpace($replaySnapshot.replayError)) {
            Set-ResultStatus "Replay" "VERIFIED"
        } else {
            if (-not [string]::IsNullOrWhiteSpace([string]$replaySnapshot.replayError)) {
                Add-ResultNote "Replay" ([string]$replaySnapshot.replayError)
            } else {
                Add-ResultNote "Replay" ([string]$replaySnapshot.playbackLog)
            }
            Set-ResultStatus "Replay" "FAILED" "Inspect logs/10-replay-state.json for the live replay failure details."
        }

        Click-ElementById $panelSocket 'saveScenario'
        Wait-ForEval $panelSocket "(() => (window.__stepIdRevalidation?.alerts || []).some((item) => item.message.includes('Saved to')) || document.getElementById('playbackLog').innerText.includes('Scenario saved to'))()" 20 'save completion' | Out-Null
        Add-ResultStep "Save" "Triggered live panel Save after the repaired replay scenario was authored."
        Add-ResultEvidence "Save" (Capture-TargetScreenshot $panelSocket '07-save-result.png')
        Add-ResultEvidence "Save" (Save-PanelSnapshot $panelSocket '11-save-state.json')
        $saveSnapshot = Get-Content (Join-Path $LogsDir "11-save-state.json") -Raw | ConvertFrom-Json
        $saveAlert = @($saveSnapshot.alerts | Where-Object { $_.message -like 'Saved to *' } | Select-Object -Last 1)
        $savedPath = if ($saveAlert.Count -gt 0) {
            ([string]$saveAlert[0].message).Substring('Saved to '.Length)
        } else {
            Join-Path $Root ("recorder-tool\examples\" + $scenarioFileName)
        }
        $scenarioList = Invoke-RestMethod -Uri "http://127.0.0.1:17845/api/scenario/list" -TimeoutSec 5
        Save-Json (Join-Path $LogsDir "12-scenario-list-after-save.json") $scenarioList
        Add-ResultEvidence "Save" "logs/12-scenario-list-after-save.json"
        $savedFileName = [System.IO.Path]::GetFileName([string]$savedPath)
        if ((Test-Path $savedPath) -and (@($scenarioList.scenarios | ForEach-Object { $_.fileName }) -contains $savedFileName)) {
            Set-ResultStatus "Save" "VERIFIED"
        } else {
            Add-ResultNote "Save" "Expected saved scenario file was not confirmed on disk or via the scenario list API."
            Set-ResultStatus "Save" "FAILED" "Inspect logs/11-save-state.json and logs/12-scenario-list-after-save.json."
        }

        Click-ElementById $panelSocket 'generateJava'
        Wait-ForEval $panelSocket "(() => (window.__stepIdRevalidation?.alerts || []).some((item) => item.message.includes('Generated')) || document.getElementById('playbackLog').innerText.includes('Java generated'))()" 20 'generate completion' | Out-Null
        Add-ResultStep "GenerateJava" "Triggered live panel Generate Java after the repaired scenario replay/save checks."
        Add-ResultEvidence "GenerateJava" (Capture-TargetScreenshot $panelSocket '08-generate-java-result.png')
        Add-ResultEvidence "GenerateJava" (Save-PanelSnapshot $panelSocket '13-generate-state.json')
        $generatedPath = Join-Path $Root ("recorder-tool\generated\java\com\timbpm\generated\ui\" + $javaClassName + ".java")
        if (Test-Path $generatedPath) {
            Set-ResultStatus "GenerateJava" "VERIFIED"
        } else {
            Add-ResultNote "GenerateJava" "Expected generated Java file was not found at $generatedPath."
            Set-ResultStatus "GenerateJava" "FAILED" "Inspect logs/13-generate-state.json and the backend output path."
        }
    } finally {
        if ($panelSocket) {
            $panelSocket.Dispose()
        }
    }

    Save-Json $SummaryPath @{
        runName = $RunName
        runDir = $RunDir
        scenarioName = $scenarioName
        scenarioFileName = $scenarioFileName
        javaClassName = $javaClassName
        results = $script:Results
        completedAt = (Get-Date).ToString('o')
    }
} catch {
    $message = $_.Exception.Message
    Write-RunLog "Step-id revalidation failed: $message"
    foreach ($key in @('Replay', 'Save', 'GenerateJava')) {
        if ($script:Results[$key].Status -eq 'PENDING') {
            Set-ResultStatus $key "BLOCKED" $message
        }
    }
    if ($script:Results.Environment.Status -eq 'PENDING') {
        Add-ResultNote "Environment" $message
        Set-ResultStatus "Environment" "BLOCKED" $message
    }
    Save-Json $SummaryPath @{
        runName = $RunName
        runDir = $RunDir
        results = $script:Results
        failedAt = (Get-Date).ToString('o')
        error = $message
    }
    throw
} finally {
    Write-ResultsMarkdown
    Stop-FixtureServer
}
