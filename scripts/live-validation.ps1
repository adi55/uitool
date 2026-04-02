param(
    [string]$Root = "C:\dev\uitool",
    [string]$RunName = "20260402-092413-live-validation",
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
$LiveLog = Join-Path $LogsDir "live-validation.log"
$ChecklistPath = Join-Path $NotesDir "validation-checklist.md"
$ResultsPath = Join-Path $NotesDir "results.md"
$SummaryJsonPath = Join-Path $LogsDir "validation-summary.json"
$FixtureServerPidPath = Join-Path $LogsDir "fixture-server.pid"
$StartRecorderBat = Join-Path $Root "start-recorder.bat"
$RecorderBootstrapScript = Join-Path $Root "scripts\recorder-bootstrap.ps1"
$script:nextCdpId = 0
$script:ExtensionId = $null

New-Item -ItemType Directory -Force -Path $ScreenshotsDir, $LogsDir, $NotesDir | Out-Null
if (-not (Test-Path $CommandsLog)) {
    Set-Content -Path $CommandsLog -Value '' -Encoding UTF8
}
Set-Content -Path $LiveLog -Value '' -Encoding UTF8

$script:Results = [ordered]@{
    Environment = [ordered]@{
        Label = "Environment / startup"
        Goal = "Verify the tool builds, the backend becomes healthy, the extension loads, the panel opens, and Start New Test works before flow validation begins."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    AddAction = [ordered]@{
        Label = "1. Add Action - live end-to-end"
        Goal = "Create manual ACTION steps live from the panel using Add Action, including at least one Type action and one Click action, verify they appear as ACTION steps, and verify a created action step can be selected and edited."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    DeleteAssert = [ordered]@{
        Label = "2. Delete selected ASSERT step - live"
        Goal = "Create an ASSERT step live, delete it from the panel, and confirm it disappears without opening an extra tab."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    Replay = [ordered]@{
        Label = "3. Replay on a non-trivial test - live"
        Goal = "Replay a live multi-step test that includes navigate, type, click, and assertion behavior, and capture running, progress, and final result evidence."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    ReplayFailure = [ordered]@{
        Label = "4. Replay assertion failure messaging - live"
        Goal = "Force a real assertion failure live and confirm the panel shows a clear, human-readable failure message."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    FinishTest = [ordered]@{
        Label = "5. Finish Test behavior - live"
        Goal = "Verify whether Finish Test exists and works live, or document it clearly as missing with evidence from the current UI."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    Save = [ordered]@{
        Label = "6. Panel Save - live"
        Goal = "Trigger Save from the live panel, capture the visible result, and verify persistence only where it is directly proven."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    Export = [ordered]@{
        Label = "7. Panel Export - live"
        Goal = "Trigger Export from the live panel and verify the actual artifact or document the exact environment boundary if automation cannot complete the save dialog."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
    GenerateJava = [ordered]@{
        Label = "8. Panel Generate Java - live"
        Goal = "Trigger Generate Java from the live panel and verify a generated output file is actually produced."
        Status = "PENDING"
        Steps = [System.Collections.Generic.List[string]]::new()
        Evidence = [System.Collections.Generic.List[string]]::new()
        Notes = [System.Collections.Generic.List[string]]::new()
        NextAction = ""
    }
}

function Write-RunLog([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date).ToString('u'), $Message
    Add-Content -Path $LiveLog -Value $line -Encoding UTF8
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

function Wait-ForHttp([string]$Url, [int]$TimeoutSeconds = 30) {
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
    if (Test-Path $FixtureServerPidPath) {
        $existingPid = Get-Content $FixtureServerPidPath -ErrorAction SilentlyContinue
        if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
            Write-RunLog "Fixture server already running on pid $existingPid"
            return
        }
    }

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

function Get-PageTargetCount() {
    return @((Get-ChromeTargets | Where-Object { $_.type -eq 'page' })).Count
}

function Close-Target([string]$TargetId) {
    try {
        Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$ChromeDebugPort/json/close/$TargetId" -TimeoutSec 5 | Out-Null
    } catch {
        Write-RunLog ("Failed to close target {0}: {1}" -f $TargetId, $_.Exception.Message)
    }
}

function Open-NewTarget([string]$Url) {
    $requestUrl = "http://127.0.0.1:$ChromeDebugPort/json/new?" + [System.Uri]::EscapeDataString($Url)
    try {
        return Invoke-RestMethod -Method Put -Uri $requestUrl -TimeoutSec 5
    } catch {
        return Invoke-RestMethod -Method Get -Uri $requestUrl -TimeoutSec 5
    }
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

function Reset-Targets([string]$ExtensionId) {
    $panelUrl = "chrome-extension://$ExtensionId/panel.html"
    $pageTargets = @(Get-ChromeTargets | Where-Object { $_.type -eq 'page' })
    $panelTargets = @($pageTargets | Where-Object { $_.url -eq $panelUrl })
    $newTarget = $null

    try {
        $newTarget = Open-NewTarget $panelUrl
    } catch {
        Write-RunLog "Opening a fresh panel target failed, falling back to an existing panel: $($_.Exception.Message)"
    }

    if ($newTarget) {
        Start-Sleep -Seconds 1
        foreach ($target in $pageTargets) {
            if ($target.id -ne $newTarget.id) {
                Close-Target $target.id
            }
        }
        Start-Sleep -Seconds 1
        Write-RunLog "Opened fresh recorder panel target $($newTarget.id) and closed other page targets"
        return
    }

    if ($panelTargets.Count -gt 0) {
        $keepTarget = $panelTargets[0]
        foreach ($target in $pageTargets) {
            if ($target.id -ne $keepTarget.id) {
                Close-Target $target.id
            }
        }
        Start-Sleep -Seconds 1
        Write-RunLog "Kept existing recorder panel target $($keepTarget.id) and closed other page targets"
        return
    }

    throw 'Could not prepare a recorder panel target'
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
        Start-Sleep -Milliseconds 400
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
        Start-Sleep -Milliseconds 400
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
    $payload = [ordered]@{
        id = $messageId
        method = $Method
    }
    if ($null -ne $Params) {
        $payload.params = $Params
    }

    $json = $payload | ConvertTo-Json -Depth 30 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [ArraySegment[byte]]::new($bytes)
    $null = $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

    while ($true) {
        $text = Read-CdpMessage $Socket
        $message = $text | ConvertFrom-Json
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
    if ($result.PSObject.Properties.Name -contains 'result') {
        return $result.result
    }
    return $result
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
  if (!element) {
    throw new Error('Missing element ' + $idLiteral);
  }
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
  if (!element) {
    throw new Error('Missing element ' + $idLiteral);
  }
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
  if (!element) {
    throw new Error('Missing element ' + $idLiteral);
  }
  element.click();
  return true;
})()
"@ | Out-Null
}

function Click-StepCardByText([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$Text) {
    $textLiteral = To-JsLiteral $Text
    Invoke-CdpEval $Socket @"
(() => {
  const cards = Array.from(document.querySelectorAll('.step-card'));
  const target = cards.find((card) => card.innerText.includes($textLiteral));
  if (!target) {
    throw new Error('Step card not found for text: ' + $textLiteral);
  }
  target.click();
  return target.innerText;
})()
"@
}

function Click-FixtureElementById([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId) {
    $idLiteral = To-JsLiteral $ElementId
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById($idLiteral);
  if (!element) {
    throw new Error('Missing fixture element ' + $idLiteral);
  }
  element.click();
  return true;
})()
"@ | Out-Null
}

function Install-PanelHooks([System.Net.WebSockets.ClientWebSocket]$Socket) {
    Invoke-CdpEval $Socket @"
(() => {
  if (!window.__liveValidationHooksInstalled) {
    window.__liveValidationHooksInstalled = true;
    window.__liveValidation = {
      alerts: [],
      downloadCalls: [],
      downloadResults: [],
      downloadErrors: []
    };
    const originalAlert = window.alert.bind(window);
    window.alert = (message) => {
      window.__liveValidation.alerts.push({
        message: String(message || ''),
        timestamp: new Date().toISOString()
      });
      console.info('[live-validation][panel-alert]', message);
    };
    const originalDownload = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = async (options) => {
      window.__liveValidation.downloadCalls.push({
        options,
        timestamp: new Date().toISOString()
      });
      try {
        const result = await originalDownload(options);
        window.__liveValidation.downloadResults.push({
          result,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        window.__liveValidation.downloadErrors.push({
          message: String(error?.message || error),
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
    window.__liveValidation.originalAlertExists = Boolean(originalAlert);
  }
  return window.__liveValidationHooksInstalled;
})()
"@ | Out-Null
}

function Capture-TargetScreenshot([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$FileName) {
    $path = Join-Path $ScreenshotsDir $FileName
    $metrics = Invoke-Cdp $Socket 'Page.getLayoutMetrics' @{}
    $contentMetrics = $null
    if ($metrics.PSObject.Properties.Name -contains 'cssContentSize') {
        $contentMetrics = $metrics.cssContentSize
    } elseif ($metrics.PSObject.Properties.Name -contains 'contentSize') {
        $contentMetrics = $metrics.contentSize
    }

    $contentWidth = if ($contentMetrics -and $contentMetrics.PSObject.Properties.Name -contains 'width') {
        [int][Math]::Ceiling([double]$contentMetrics.width)
    } else {
        1280
    }
    $contentHeight = if ($contentMetrics -and $contentMetrics.PSObject.Properties.Name -contains 'height') {
        [int][Math]::Ceiling([double]$contentMetrics.height)
    } else {
        960
    }
    if ($contentWidth -lt 1280) { $contentWidth = 1280 }
    if ($contentHeight -lt 960) { $contentHeight = 960 }

    Invoke-Cdp $Socket 'Emulation.setDeviceMetricsOverride' @{
        width = $contentWidth
        height = $contentHeight
        deviceScaleFactor = 1
        mobile = $false
    } | Out-Null

    $capture = Invoke-Cdp $Socket 'Page.captureScreenshot' @{
        format = 'png'
        fromSurface = $true
        captureBeyondViewport = $true
    }
    [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($capture.data))
    Write-RunLog "Saved screenshot $path"
    return ("screenshots/" + $FileName)
}

function Save-Json([string]$Path, $Value) {
    $Value | ConvertTo-Json -Depth 10 | Set-Content -Path $Path -Encoding UTF8
}

function Save-PanelSnapshot([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$FileName) {
    $snapshot = Invoke-CdpEval $Socket @"
(() => ({
  replaySummary: document.getElementById('replaySummary')?.innerText || '',
  replayError: document.getElementById('replayError')?.innerText || '',
  playbackLog: document.getElementById('playbackLog')?.innerText || '',
  statusActiveTest: document.getElementById('statusActiveTest')?.innerText || '',
  statusTestStatus: document.getElementById('statusTestStatus')?.innerText || '',
  statusAttachedTab: document.getElementById('statusAttachedTab')?.innerText || '',
  statusCurrentMode: document.getElementById('statusCurrentMode')?.innerText || '',
  statusSelectedStep: document.getElementById('statusSelectedStep')?.innerText || '',
  statusRecording: document.getElementById('statusRecording')?.innerText || '',
  statusReplay: document.getElementById('statusReplay')?.innerText || '',
  testSessionSummary: document.getElementById('testSessionSummary')?.innerText || '',
  selectedStepHint: document.getElementById('selectedStepHint')?.innerText || '',
  deleteButtonLabel: document.getElementById('deleteSelectedStep')?.innerText || '',
  stepCount: document.querySelectorAll('.step-card').length,
  testCount: document.querySelectorAll('.test-card').length,
  activeAlerts: window.__liveValidation?.alerts || [],
  downloadCalls: window.__liveValidation?.downloadCalls || [],
  downloadResults: window.__liveValidation?.downloadResults || [],
  downloadErrors: window.__liveValidation?.downloadErrors || [],
  selectedStepText: (() => {
    const selected = document.querySelector('.step-card.is-selected, .step-card.selected');
    return selected ? selected.innerText : '';
  })(),
  recorderState: typeof recorderState !== 'undefined' ? recorderState : null,
  currentState: typeof currentState !== 'undefined' ? currentState : null
}))()
"@
    Save-Json (Join-Path $LogsDir $FileName) $snapshot
    return ("logs/" + $FileName)
}

function Save-Text([string]$FileName, [string]$Content) {
    $path = Join-Path $LogsDir $FileName
    Set-Content -Path $path -Value $Content -Encoding UTF8
    return ("logs/" + $FileName)
}

function Sanitize-FileName([string]$Value) {
    $normalized = ($Value -replace '[^a-zA-Z0-9\-_]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return "recorded-scenario"
    }
    return $normalized.ToLowerInvariant()
}

function Write-ChecklistMarkdown() {
    $statusMap = @{
        VERIFIED = "[x]"
        FAILED = "[ ]"
        BLOCKED = "[ ]"
        "NOT IMPLEMENTED" = "[ ]"
        PENDING = "[ ]"
    }
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Live Validation Checklist")
    $lines.Add("")
    $lines.Add("Run folder: testingtheapp/runs/$RunName")
    $lines.Add("")
    $lines.Add("Environment setup:")
    $lines.Add("")
    $environmentDone = $script:Results.Environment.Status -eq 'VERIFIED'
    foreach ($item in @(
        'Build the tool',
        'Start backend',
        'Verify backend health',
        'Verify extension is loaded / loadable',
        'Verify panel opens',
        'Verify Start New Test still works'
    )) {
        $environmentBox = if ($environmentDone) { "[x]" } else { "[ ]" }
        $lines.Add(("{0} {1}" -f $environmentBox, $item))
    }
    $lines.Add("")
    $lines.Add("Required flow order:")
    $lines.Add("")
    foreach ($key in @('AddAction', 'DeleteAssert', 'Replay', 'ReplayFailure', 'FinishTest', 'Save', 'Export', 'GenerateJava')) {
        $entry = $script:Results[$key]
        $box = $statusMap[$entry.Status]
        $lines.Add("$box $($entry.Label) - $($entry.Status)")
    }
    Set-Content -Path $ChecklistPath -Value $lines -Encoding UTF8
}

function Write-ResultsMarkdown() {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Live Validation Results")
    $lines.Add("")
    $lines.Add("Run folder: testingtheapp/runs/$RunName")
    $lines.Add("")
    $lines.Add("## Summary")
    $lines.Add("")
    $lines.Add("| Flow | Status | Evidence |")
    $lines.Add("| --- | --- | --- |")
    foreach ($key in @('Environment', 'AddAction', 'DeleteAssert', 'Replay', 'ReplayFailure', 'FinishTest', 'Save', 'Export', 'GenerateJava')) {
        $entry = $script:Results[$key]
        $evidencePreview = if ($entry.Evidence.Count -gt 0) { ($entry.Evidence[0..([Math]::Min($entry.Evidence.Count - 1, 2))] -join "<br>") } else { "" }
        $lines.Add("| $($entry.Label) | $($entry.Status) | $evidencePreview |")
    }

    foreach ($key in @('Environment', 'AddAction', 'DeleteAssert', 'Replay', 'ReplayFailure', 'FinishTest', 'Save', 'Export', 'GenerateJava')) {
        $entry = $script:Results[$key]
        $lines.Add("")
        $lines.Add("## $($entry.Label)")
        $lines.Add("")
        $lines.Add("Goal:")
        $lines.Add($entry.Goal)
        $lines.Add("")
        $lines.Add("Steps attempted:")
        if ($entry.Steps.Count -eq 0) {
            $lines.Add("Pending.")
        } else {
            foreach ($step in $entry.Steps) {
                $lines.Add("- $step")
            }
        }
        $lines.Add("")
        $lines.Add("Result: $($entry.Status)")
        $lines.Add("")
        $lines.Add("Evidence files:")
        if ($entry.Evidence.Count -eq 0) {
            $lines.Add("Pending.")
        } else {
            foreach ($evidence in $entry.Evidence) {
                $lines.Add("- $evidence")
            }
        }
        $lines.Add("")
        $lines.Add("Notes:")
        if ($entry.Notes.Count -eq 0) {
            $lines.Add("None.")
        } else {
            foreach ($note in $entry.Notes) {
                $lines.Add("- $note")
            }
        }
        $lines.Add("")
        $lines.Add("Next action if failed or blocked:")
        $nextActionText = if ([string]::IsNullOrWhiteSpace($entry.NextAction)) { "None." } else { $entry.NextAction }
        $lines.Add($nextActionText)
    }
    Set-Content -Path $ResultsPath -Value $lines -Encoding UTF8
}

Write-ChecklistMarkdown
Write-ResultsMarkdown

try {
    $scenarioName = "Live Validation $RunName"
    $javaClassName = ("LiveValidation" + ($RunName -replace '[^0-9]', '') + "GeneratedTest")
    $scenarioFileName = (Sanitize-FileName $scenarioName) + ".json"

    Add-ResultStep "Environment" "Prepared run folder $RunDir"
    Start-FixtureServer
    Add-ResultEvidence "Environment" "logs/commands.txt"

    if (-not $SkipRuntimeStart) {
        Invoke-RecorderCommand @("stop") (Join-Path $LogsDir "01-start-recorder-stop.log") | Out-Null
        Add-ResultStep "Environment" "Stopped any previous managed recorder runtime"
        Add-ResultEvidence "Environment" "logs/01-start-recorder-stop.log"

        Invoke-RecorderCommand @() (Join-Path $LogsDir "02-start-recorder-start.log") | Out-Null
        Add-ResultStep "Environment" "Built and started the recorder runtime with backend and managed Chrome"
        Add-ResultEvidence "Environment" "logs/02-start-recorder-start.log"
    } else {
        Add-CommandRecord ".\start-recorder.bat <skipped; reusing existing runtime>"
        $runtimeStateSource = Join-Path $Root ".runtime\runtime-state.json"
        if (Test-Path $runtimeStateSource) {
            Copy-Item -Path $runtimeStateSource -Destination (Join-Path $LogsDir "02-runtime-state-reused.json") -Force
            Add-ResultEvidence "Environment" "logs/02-runtime-state-reused.json"
        }
        Add-ResultStep "Environment" "Reused the already-running managed backend and Chrome session after the initial launcher call hung while waiting on the batch wrapper."
    }

    $doctorOutput = Invoke-RecorderCommand @("doctor") (Join-Path $LogsDir "03-doctor-output.txt")
    $doctorJson = ($doctorOutput -join [Environment]::NewLine) | ConvertFrom-Json
    Save-Json (Join-Path $LogsDir "03-doctor-output.json") $doctorJson
    Add-ResultStep "Environment" "Ran doctor to verify backend, extension, panel, and runtime wiring"
    Add-ResultEvidence "Environment" "logs/03-doctor-output.json"

    $health = Invoke-RestMethod -Uri "http://127.0.0.1:17845/api/health" -TimeoutSec 5
    Save-Json (Join-Path $LogsDir "04-backend-health.json") $health
    Add-ResultStep "Environment" "Verified backend health on http://127.0.0.1:17845/api/health"
    Add-ResultEvidence "Environment" "logs/04-backend-health.json"

    $script:ExtensionId = Find-ExtensionId
    Save-Json (Join-Path $LogsDir "05-extension-status.json") @{
        extensionId = $script:ExtensionId
        pageTargetCount = Get-PageTargetCount
        capturedAt = (Get-Date).ToString('o')
    }
    Add-ResultStep "Environment" "Detected extension id $script:ExtensionId"
    Add-ResultEvidence "Environment" "logs/05-extension-status.json"

    Reset-Targets $script:ExtensionId
    $panelTarget = Get-PanelTarget $script:ExtensionId
    $panelSocket = New-CdpSession $panelTarget.webSocketDebuggerUrl
    try {
        Enable-CdpPage $panelSocket
        Install-PanelHooks $panelSocket
        Wait-ForEval $panelSocket "(() => document.getElementById('backendState') && document.getElementById('testsList'))()" 15 'panel initial DOM' | Out-Null
        Wait-ForEval $panelSocket "(() => /ok|ready|healthy|online/i.test(document.getElementById('backendState').innerText) || /ready|backend/i.test(document.getElementById('backendActionState').innerText))()" 20 'panel backend state'

        Set-InputValue $panelSocket 'scenarioName' $scenarioName
        Set-InputValue $panelSocket 'startUrl' $FixtureUrl
        Set-InputValue $panelSocket 'javaClassName' $javaClassName
        Start-Sleep -Milliseconds 500

        Add-ResultStep "Environment" "Verified the panel opened and showed backend-ready state"
        Add-ResultEvidence "Environment" (Capture-TargetScreenshot $panelSocket '01-panel-initial-state.png')
        Add-ResultEvidence "Environment" (Save-PanelSnapshot $panelSocket '06-panel-initial-state.json')

        $pageCountBeforeStart = Get-PageTargetCount
        Click-ElementById $panelSocket 'startNewTest'
        Wait-ForEval $panelSocket "(() => document.getElementById('statusAttachedTab').innerText.includes('Attached'))()" 20 'attached controlled tab' | Out-Null
        Wait-ForEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('On') || document.getElementById('recordingModePill').innerText.includes('Recording'))()" 20 'recording on after new test' | Out-Null
        $fixtureTarget = Get-PageTargetByUrl "$FixtureUrl*"
        $pageCountAfterStart = Get-PageTargetCount
        Save-Json (Join-Path $LogsDir "07-start-new-test-tab-count.json") @{
            before = $pageCountBeforeStart
            after = $pageCountAfterStart
            capturedAt = (Get-Date).ToString('o')
        }
        Add-ResultStep "Environment" "Start New Test opened one controlled tab for the local fixture page"
        Add-ResultEvidence "Environment" "logs/07-start-new-test-tab-count.json"

        # Reconnect to a fresh panel target after Start New Test because the existing
        # websocket becomes flaky once the new controlled browser tab is attached.
        $panelSocket.Dispose()
        $panelSocket = $null
        $panelTarget = Get-PanelTarget $script:ExtensionId
        $panelSocket = New-CdpSession $panelTarget.webSocketDebuggerUrl
        Enable-CdpPage $panelSocket
        Install-PanelHooks $panelSocket
        Wait-ForEval $panelSocket "(() => document.getElementById('statusAttachedTab').innerText.includes('Attached'))()" 20 'attached state after panel reconnect' | Out-Null
        Add-ResultEvidence "Environment" (Capture-TargetScreenshot $panelSocket '02-after-start-new-test.png')
        Set-ResultStatus "Environment" "VERIFIED"

        if (Invoke-CdpEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('On'))()") {
            Click-ElementById $panelSocket 'stopRecording'
            Wait-ForEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('Off'))()" 10 'recording off before add action' | Out-Null
            Add-ResultNote "AddAction" "Start New Test left the panel in recording mode, so recording was stopped before manual action authoring to avoid mixing live recording with manual Add Action validation."
        }

        $flow1PageCountBefore = Get-PageTargetCount
        Click-ElementById $panelSocket 'addActionMode'
        Wait-ForEval $panelSocket "(() => !document.getElementById('actionComposer').classList.contains('hidden'))()" 10 'action composer open' | Out-Null
        Set-SelectValue $panelSocket 'actionTypeSelect' 'type'
        Click-ElementById $panelSocket 'pickActionTarget'
        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Click-FixtureElementById $fixtureSocket 'usernameInput'
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.getElementById('actionTargetValue').value.trim().length > 0)()" 10 'picked action target for type' | Out-Null
        Set-InputValue $panelSocket 'actionValueInput' 'alice'
        Add-ResultEvidence "AddAction" (Capture-TargetScreenshot $panelSocket '03-add-action-composer.png')
        Add-ResultStep "AddAction" "Opened Add Action, used the live picker on the fixture input field, and configured a Type action for value 'alice'"
        Click-ElementById $panelSocket 'createAction'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 2)()" 10 'first action step' | Out-Null

        Click-ElementById $panelSocket 'addActionMode'
        Wait-ForEval $panelSocket "(() => !document.getElementById('actionComposer').classList.contains('hidden'))()" 10 'action composer reopen' | Out-Null
        Set-SelectValue $panelSocket 'actionTypeSelect' 'click'
        Click-ElementById $panelSocket 'pickActionTarget'
        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Click-FixtureElementById $fixtureSocket 'loginBtn'
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.getElementById('actionTargetValue').value.trim().length > 0)()" 10 'picked action target for click' | Out-Null
        Click-ElementById $panelSocket 'createAction'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 3)()" 10 'second action step' | Out-Null
        Add-ResultEvidence "AddAction" (Capture-TargetScreenshot $panelSocket '04-created-action-step.png')
        Add-ResultStep "AddAction" "Created live Type and Click ACTION steps from the panel"

        Click-StepCardByText $panelSocket 'Type "' | Out-Null
        Wait-ForEval $panelSocket "(() => document.getElementById('stepSubtype').value.toLowerCase().includes('type'))()" 10 'selected type step editor' | Out-Null
        Set-InputValue $panelSocket 'stepNoteInput' 'validated-live'
        Click-ElementById $panelSocket 'applyStepChanges'
        Wait-ForEval $panelSocket "(() => document.getElementById('playbackLog').innerText.includes('Updated step'))()" 10 'updated selected action step' | Out-Null
        Add-ResultEvidence "AddAction" (Capture-TargetScreenshot $panelSocket '05-selected-action-step-editor.png')
        $flow1PageCountAfter = Get-PageTargetCount
        Save-Json (Join-Path $LogsDir "08-add-action-tab-count.json") @{
            before = $flow1PageCountBefore
            after = $flow1PageCountAfter
            capturedAt = (Get-Date).ToString('o')
        }
        Add-ResultEvidence "AddAction" "logs/08-add-action-tab-count.json"
        Add-ResultEvidence "AddAction" (Save-PanelSnapshot $panelSocket '09-add-action-panel-state.json')
        Add-ResultNote "AddAction" "Page target count stayed at $flow1PageCountAfter while opening Add Action, using picker, and creating the manual steps."
        Set-ResultStatus "AddAction" "VERIFIED"

        $flow2PageCountBefore = Get-PageTargetCount
        Click-ElementById $panelSocket 'assertionMode'
        Wait-ForEval $panelSocket "(() => !document.getElementById('assertionComposer').classList.contains('hidden'))()" 10 'assertion composer open' | Out-Null
        Click-ElementById $panelSocket 'pickAssertionTarget'
        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Click-FixtureElementById $fixtureSocket 'message'
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.getElementById('assertionTargetValue').value.trim().length > 0)()" 10 'picked assertion target' | Out-Null
        Set-SelectValue $panelSocket 'assertionTypeSelect' 'assert_text_equals'
        Set-InputValue $panelSocket 'assertionExpectedValue' 'Waiting for action'
        Click-ElementById $panelSocket 'createAssertion'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 4)()" 10 'temporary assert step' | Out-Null
        Wait-ForEval $panelSocket "(() => document.getElementById('deleteSelectedStep').innerText.includes('Assertion'))()" 10 'delete assertion label' | Out-Null
        Add-ResultEvidence "DeleteAssert" (Capture-TargetScreenshot $panelSocket '06-assert-step-before-delete.png')
        Add-ResultStep "DeleteAssert" "Created a live ASSERT step, selected it, and confirmed the delete button relabeled itself to 'Delete Selected Assertion'"
        Click-ElementById $panelSocket 'deleteSelectedStep'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length === 3)()" 10 'assertion deleted' | Out-Null
        Add-ResultEvidence "DeleteAssert" (Capture-TargetScreenshot $panelSocket '07-assert-step-after-delete.png')
        $flow2PageCountAfter = Get-PageTargetCount
        Save-Json (Join-Path $LogsDir "10-delete-assert-tab-count.json") @{
            before = $flow2PageCountBefore
            after = $flow2PageCountAfter
            capturedAt = (Get-Date).ToString('o')
            deleteButtonLabel = (Invoke-CdpEval $panelSocket "(() => document.getElementById('deleteSelectedStep').innerText)()")
            selectedStepHint = (Invoke-CdpEval $panelSocket "(() => document.getElementById('selectedStepHint').innerText)()")
        }
        Add-ResultEvidence "DeleteAssert" "logs/10-delete-assert-tab-count.json"
        Add-ResultNote "DeleteAssert" "Delete labeling/help was clear during selection because the button text changed to 'Delete Selected Assertion' and the step hint explicitly referenced that label."
        Set-ResultStatus "DeleteAssert" "VERIFIED"

        Click-ElementById $panelSocket 'assertionMode'
        Wait-ForEval $panelSocket "(() => !document.getElementById('assertionComposer').classList.contains('hidden'))()" 10 'assertion composer for replay setup' | Out-Null
        Click-ElementById $panelSocket 'pickAssertionTarget'
        $fixtureSocket = New-CdpSession $fixtureTarget.webSocketDebuggerUrl
        try {
            Enable-CdpPage $fixtureSocket
            Click-FixtureElementById $fixtureSocket 'message'
        } finally {
            $fixtureSocket.Dispose()
        }
        Wait-ForEval $panelSocket "(() => document.getElementById('assertionTargetValue').value.trim().length > 0)()" 10 'picked assertion target for replay' | Out-Null
        Set-SelectValue $panelSocket 'assertionTypeSelect' 'assert_text_equals'
        Set-InputValue $panelSocket 'assertionExpectedValue' 'Logged in as alice'
        Click-ElementById $panelSocket 'createAssertion'
        Wait-ForEval $panelSocket "(() => document.querySelectorAll('.step-card').length >= 4)()" 10 'replay assertion step created' | Out-Null
        Add-ResultStep "Replay" "Added a live ASSERT step so the replayed test now covers navigate, type, click, and assertion behavior"
        Add-ResultEvidence "Replay" (Save-PanelSnapshot $panelSocket '11-replay-setup-state.json')

        $replayReachedRunnableState = $false
        try {
            $replayDisabled = Invoke-CdpEval $panelSocket "(() => document.getElementById('replayAll').disabled)()"
            if ($replayDisabled) {
                throw 'Replay button was disabled even though the live test had four steps, recording was off, and a controlled tab was attached.'
            }

            Click-ElementById $panelSocket 'replayAll'
            Wait-ForEval $panelSocket "(() => document.getElementById('statusReplay').innerText.toLowerCase().includes('running'))()" 20 'replay running' | Out-Null
            $replayReachedRunnableState = $true
            Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '08-replay-running.png')
            Add-ResultStep "Replay" "Started live replay from the panel on a four-step test"

            Start-Sleep -Milliseconds 400
            if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('pausePlayback').disabled)()") {
                Click-ElementById $panelSocket 'pausePlayback'
                Wait-ForEval $panelSocket "(() => document.getElementById('statusReplay').innerText.toLowerCase().includes('paused') || document.getElementById('statusReplay').innerText.toLowerCase().includes('failed'))()" 10 'replay paused for progress capture' | Out-Null
                Add-ResultStep "Replay" "Paused the live replay briefly to capture current step progress/highlighting in the panel"
                Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '09-replay-progress.png')
                if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('resumePlayback').disabled)()") {
                    Click-ElementById $panelSocket 'resumePlayback'
                }
            } else {
                Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '09-replay-progress.png')
                Add-ResultNote "Replay" "Replay progressed too quickly for an explicit pause, so the second capture was taken from the live running state instead."
            }

            Wait-ForEval $panelSocket "(() => /completed|failed|stopped/i.test(document.getElementById('statusReplay').innerText) || document.getElementById('replayError').innerText.trim().length > 0)()" 30 'replay final state' | Out-Null
            Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '10-replay-success-or-failure.png')
            Add-ResultEvidence "Replay" (Save-PanelSnapshot $panelSocket '12-replay-success-state.json')
            $replaySucceeded = Invoke-CdpEval $panelSocket "(() => document.getElementById('statusReplay').innerText.toLowerCase().includes('completed') && !document.getElementById('replayError').innerText.trim())()"
            if ($replaySucceeded) {
                Set-ResultStatus "Replay" "VERIFIED"
            } else {
                Set-ResultStatus "Replay" "FAILED" "Inspect logs/12-replay-success-state.json and the live panel playback log to determine why the non-trivial replay did not complete."
            }
        } catch {
            $replayIssue = $_.Exception.Message
            Add-ResultEvidence "Replay" (Capture-TargetScreenshot $panelSocket '08-replay-running.png')
            Add-ResultEvidence "Replay" (Save-PanelSnapshot $panelSocket '12-replay-success-state.json')
            Add-ResultNote "Replay" $replayIssue
            Set-ResultStatus "Replay" "FAILED" "Fix the live panel replay launch path, then rerun the non-trivial replay flow."
        }

        if ($replayReachedRunnableState) {
            Click-StepCardByText $panelSocket 'Expect element with' | Out-Null
            Wait-ForEval $panelSocket "(() => document.getElementById('stepExpectedValue').value.includes('Logged in as alice'))()" 10 'selected assertion step editor' | Out-Null
            Set-InputValue $panelSocket 'stepExpectedValue' 'Logged in as bob'
            Click-ElementById $panelSocket 'applyStepChanges'
            Wait-ForEval $panelSocket "(() => document.getElementById('stepExpectedValue').value === 'Logged in as bob')()" 10 'failing assertion value applied' | Out-Null
            Add-ResultEvidence "ReplayFailure" (Capture-TargetScreenshot $panelSocket '11-failing-assertion-setup.png')
            Add-ResultStep "ReplayFailure" "Edited the live assertion step so replay would expect the wrong final text ('Logged in as bob')"

            try {
                Click-ElementById $panelSocket 'replayAll'
                Wait-ForEval $panelSocket "(() => /failed/i.test(document.getElementById('statusReplay').innerText) || document.getElementById('replayError').innerText.trim().length > 0)()" 30 'replay failure state' | Out-Null
                $failureMessage = Invoke-CdpEval $panelSocket "(() => document.getElementById('replayError').innerText || document.getElementById('playbackLog').innerText)()"
                Add-ResultEvidence "ReplayFailure" (Capture-TargetScreenshot $panelSocket '12-failing-assertion-message.png')
                Add-ResultEvidence "ReplayFailure" (Save-PanelSnapshot $panelSocket '13-replay-failure-state.json')
                Add-ResultEvidence "ReplayFailure" (Save-Text '14-replay-failure-message.txt' $failureMessage)
                if ($failureMessage -match 'Assertion failed:' -and $failureMessage -match 'expected text') {
                    Add-ResultNote "ReplayFailure" "The live failure wording was human-readable: $failureMessage"
                    Set-ResultStatus "ReplayFailure" "VERIFIED"
                } else {
                    Add-ResultNote "ReplayFailure" "The live failure wording was not clear enough: $failureMessage"
                    Set-ResultStatus "ReplayFailure" "FAILED" "Improve live replay failure wording in the panel or replay log so the failing assertion is understandable without reading source code."
                }
            } catch {
                $failureReplayIssue = $_.Exception.Message
                Add-ResultEvidence "ReplayFailure" (Save-PanelSnapshot $panelSocket '13-replay-failure-state.json')
                Add-ResultNote "ReplayFailure" $failureReplayIssue
                Set-ResultStatus "ReplayFailure" "FAILED" "Fix the live replay failure path so the panel surfaces a user-visible assertion error."
            }
        } else {
            Add-ResultStep "ReplayFailure" "Attempted to continue to the assertion-failure messaging flow after the replay setup, but the live replay never entered a running state."
            Add-ResultNote "ReplayFailure" "Flow 4 depends on a working live replay launch from the panel. Because flow 3 failed before replay started, the assertion-failure messaging flow could not be exercised."
            Set-ResultStatus "ReplayFailure" "BLOCKED" "Fix the live panel replay launch path, then rerun flows 3 and 4."
        }

        if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('stopPlayback').disabled)()") {
            Click-ElementById $panelSocket 'stopPlayback'
            Wait-ForEval $panelSocket "(() => /stopped|idle/i.test(document.getElementById('statusReplay').innerText) || !recorderState.replaying)()" 10 'replay stopped before finish test' | Out-Null
            Add-ResultStep "FinishTest" "Stopped the failed replay session before testing Finish Test, because Finish Test is intentionally blocked while replay is active."
        }

        $finishImplemented = Invoke-CdpEval $panelSocket "(() => Boolean(document.getElementById('finishTest')) )()"
        if (-not $finishImplemented) {
            Add-ResultEvidence "FinishTest" (Capture-TargetScreenshot $panelSocket '13-finish-test-state.png')
            Add-ResultNote "FinishTest" "No Finish Test control was present in the live panel."
            Set-ResultStatus "FinishTest" "NOT IMPLEMENTED"
        } else {
            $pageCountBeforeFinish = Get-PageTargetCount
            Click-ElementById $panelSocket 'finishTest'
            Wait-ForEval $panelSocket "(() => document.getElementById('statusAttachedTab').innerText.includes('No Tab') || document.getElementById('testSessionSummary').innerText.includes('detached'))()" 15 'finished test detached state' | Out-Null
            $pageCountAfterFinish = Get-PageTargetCount
            Add-ResultEvidence "FinishTest" (Capture-TargetScreenshot $panelSocket '13-finish-test-state.png')
            Add-ResultEvidence "FinishTest" (Save-PanelSnapshot $panelSocket '15-finish-test-state.json')
            Save-Json (Join-Path $LogsDir "16-finish-test-tab-count.json") @{
                before = $pageCountBeforeFinish
                after = $pageCountAfterFinish
                capturedAt = (Get-Date).ToString('o')
            }
            Add-ResultEvidence "FinishTest" "logs/16-finish-test-tab-count.json"
            Add-ResultNote "FinishTest" "Finish Test detached recorder control from the active browser tab without opening a new one."
            Set-ResultStatus "FinishTest" "VERIFIED"
        }

        Click-ElementById $panelSocket 'saveScenario'
        Wait-ForEval $panelSocket "(() => (window.__liveValidation?.alerts || []).some((item) => item.message.includes('Saved to')) || document.getElementById('playbackLog').innerText.includes('Scenario saved to'))()" 20 'save completion' | Out-Null
        $saveAlert = Invoke-CdpEval $panelSocket "(() => (window.__liveValidation?.alerts || []).filter((item) => item.message.includes('Saved to')).slice(-1)[0]?.message || '')()"
        $savedScenarioPath = Join-Path $Root ("recorder-tool\examples\" + $scenarioFileName)
        $saveList = Invoke-RestMethod -Uri "http://127.0.0.1:17845/api/scenario/list" -TimeoutSec 5
        Save-Json (Join-Path $LogsDir "17-scenario-list-after-save.json") $saveList
        $saveLoad = Invoke-RestMethod -Uri ("http://127.0.0.1:17845/api/scenario/load?file=" + [System.Uri]::EscapeDataString($scenarioFileName)) -TimeoutSec 5
        Save-Json (Join-Path $LogsDir "18-scenario-load-after-save.json") $saveLoad
        Add-ResultEvidence "Save" (Capture-TargetScreenshot $panelSocket '14-panel-save-result.png')
        Add-ResultEvidence "Save" "logs/17-scenario-list-after-save.json"
        Add-ResultEvidence "Save" "logs/18-scenario-load-after-save.json"
        if ((Test-Path $savedScenarioPath) -and ($saveList.scenarios.fileName -contains $scenarioFileName)) {
            Add-ResultNote "Save" "Save persistence was directly confirmed via the saved file path and the scenario list/load endpoints. Alert text: $saveAlert"
            Set-ResultStatus "Save" "VERIFIED"
        } else {
            Add-ResultNote "Save" "Save was triggered, but persistence could not be fully confirmed. Alert text: $saveAlert"
            Set-ResultStatus "Save" "FAILED" "Inspect the backend save path and scenario list output to determine why the saved scenario did not appear as expected."
        }

        Click-ElementById $panelSocket 'exportScenario'
        Start-Sleep -Seconds 4
        $exportSnapshotPath = Save-PanelSnapshot $panelSocket '19-export-state.json'
        $exportSnapshot = Get-Content (Join-Path $LogsDir '19-export-state.json') -Raw | ConvertFrom-Json
        Add-ResultEvidence "Export" (Capture-TargetScreenshot $panelSocket '15-panel-export-result.png')
        Add-ResultEvidence "Export" $exportSnapshotPath
        if ($exportSnapshot.downloadResults.Count -gt 0) {
            Add-ResultNote "Export" "Export completed live through chrome.downloads.download and returned download id $($exportSnapshot.downloadResults[-1].result)."
            Set-ResultStatus "Export" "VERIFIED"
        } elseif ($exportSnapshot.downloadCalls.Count -gt 0 -and $exportSnapshot.downloadErrors.Count -eq 0) {
            Add-ResultNote "Export" "The live Export button invoked chrome.downloads.download with saveAs=true, but no completion result returned within the automated wait window. This is consistent with a native Save As dialog boundary outside CDP control."
            Set-ResultStatus "Export" "BLOCKED" "Complete the export manually in the browser Save As dialog or add an environment-specific way to automate native save confirmation."
        } elseif ($exportSnapshot.downloadErrors.Count -gt 0) {
            Add-ResultNote "Export" "Export returned an error: $($exportSnapshot.downloadErrors[-1].message)"
            Set-ResultStatus "Export" "FAILED" "Inspect logs/19-export-state.json and the panel console path for the download error."
        } else {
            Add-ResultNote "Export" "No download call was observed after clicking Export."
            Set-ResultStatus "Export" "FAILED" "Inspect the Export button handler and extension permissions."
        }

        Click-ElementById $panelSocket 'generateJava'
        Wait-ForEval $panelSocket "(() => (window.__liveValidation?.alerts || []).some((item) => item.message.includes('Generated')) || document.getElementById('playbackLog').innerText.includes('Java generated'))()" 20 'generate java completion' | Out-Null
        $generateAlert = Invoke-CdpEval $panelSocket "(() => (window.__liveValidation?.alerts || []).filter((item) => item.message.includes('Generated')).slice(-1)[0]?.message || '')()"
        $generatedPath = Join-Path $Root ("recorder-tool\generated\java\com\timbpm\generated\ui\" + $javaClassName + ".java")
        Add-ResultEvidence "GenerateJava" (Capture-TargetScreenshot $panelSocket '16-panel-generate-java-result.png')
        Add-ResultEvidence "GenerateJava" (Save-PanelSnapshot $panelSocket '20-generate-java-state.json')
        if (Test-Path $generatedPath) {
            Add-ResultNote "GenerateJava" "Generate Java produced $generatedPath. Alert text: $generateAlert"
            Set-ResultStatus "GenerateJava" "VERIFIED"
        } else {
            Add-ResultNote "GenerateJava" "Generate Java was invoked live, but the expected output file was not found. Alert text: $generateAlert"
            Set-ResultStatus "GenerateJava" "FAILED" "Inspect the generate response and the backend output path."
        }

        Save-Json $SummaryJsonPath @{
            runName = $RunName
            runDir = $RunDir
            scenarioName = $scenarioName
            javaClassName = $javaClassName
            results = $script:Results
            completedAt = (Get-Date).ToString('o')
        }
    } finally {
        if ($panelSocket) {
            $panelSocket.Dispose()
        }
    }
} catch {
    $errorMessage = $_.Exception.Message
    Write-RunLog "Validation runner failed: $errorMessage"
    if ($script:Results.Environment.Status -eq 'PENDING') {
        Add-ResultNote "Environment" $errorMessage
        Set-ResultStatus "Environment" "BLOCKED" "Resolve the startup/runtime blocker and rerun the live validation pass."
    }
    Save-Json $SummaryJsonPath @{
        runName = $RunName
        runDir = $RunDir
        results = $script:Results
        failedAt = (Get-Date).ToString('o')
        error = $errorMessage
    }
    throw
} finally {
    Write-ChecklistMarkdown
    Write-ResultsMarkdown
    Stop-FixtureServer
}
