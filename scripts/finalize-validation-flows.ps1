param(
    [string]$Root = "C:\dev\uitool",
    [string]$RunName = "20260402-100752-live-validation",
    [int]$ChromeDebugPort = 9222
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RunDir = Join-Path $Root ("testingtheapp\runs\" + $RunName)
$ScreenshotsDir = Join-Path $RunDir "screenshots"
$LogsDir = Join-Path $RunDir "logs"
$LogPath = Join-Path $LogsDir "finalize-validation.log"
$SummaryPath = Join-Path $LogsDir "finalize-validation-summary.json"
$script:nextCdpId = 0

Set-Content -Path $LogPath -Value '' -Encoding UTF8

function Write-RunLog([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date).ToString('u'), $Message
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    Write-Host $line
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

function Get-ChromeTargets() {
    Wait-ForHttp "http://127.0.0.1:$ChromeDebugPort/json/version" 15 | Out-Null
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$ChromeDebugPort/json/list" -TimeoutSec 5
    if ($null -ne $response -and $response.PSObject.Properties.Name -contains 'value') {
        return @($response.value)
    }
    return @($response)
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
    $newTarget = Open-NewTarget $panelUrl
    Start-Sleep -Seconds 1
    foreach ($target in $pageTargets) {
        if ($target.id -ne $newTarget.id) {
            Close-Target $target.id
        }
    }
    Start-Sleep -Seconds 1
}

function Get-PanelTarget([string]$ExtensionId) {
    $deadline = (Get-Date).AddSeconds(15)
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
}

function Save-Json([string]$FileName, $Value) {
    $path = Join-Path $LogsDir $FileName
    $Value | ConvertTo-Json -Depth 12 | Set-Content -Path $path -Encoding UTF8
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
  replayDisabled: document.getElementById('replayAll')?.disabled || false,
  pauseDisabled: document.getElementById('pausePlayback')?.disabled || false,
  stopDisabled: document.getElementById('stopPlayback')?.disabled || false,
  saveDisabled: document.getElementById('saveScenario')?.disabled || false,
  exportDisabled: document.getElementById('exportScenario')?.disabled || false,
  generateDisabled: document.getElementById('generateJava')?.disabled || false,
  stepCount: document.querySelectorAll('.step-card').length,
  alerts: window.__liveValidation?.alerts || [],
  downloadCalls: window.__liveValidation?.downloadCalls || [],
  downloadResults: window.__liveValidation?.downloadResults || [],
  downloadErrors: window.__liveValidation?.downloadErrors || []
}))()
"@
    Save-Json $FileName $snapshot
}

function Click-ElementById([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId) {
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById("$ElementId");
  if (!element) throw new Error('Missing element $ElementId');
  element.click();
  return true;
})()
"@ | Out-Null
}

function Set-InputValue([System.Net.WebSockets.ClientWebSocket]$Socket, [string]$ElementId, [string]$Value) {
    $valueLiteral = ($Value | ConvertTo-Json -Compress)
    Invoke-CdpEval $Socket @"
(() => {
  const element = document.getElementById("$ElementId");
  if (!element) throw new Error('Missing element $ElementId');
  element.focus();
  element.value = $valueLiteral;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
"@ | Out-Null
}

function Install-PanelHooks([System.Net.WebSockets.ClientWebSocket]$Socket) {
    Invoke-CdpEval $Socket @"
(() => {
  if (!window.__liveValidationHooksInstalled) {
    window.__liveValidationHooksInstalled = true;
    window.__liveValidation = { alerts: [], downloadCalls: [], downloadResults: [], downloadErrors: [] };
    const originalAlert = window.alert.bind(window);
    window.alert = (message) => {
      window.__liveValidation.alerts.push({ message: String(message || ''), timestamp: new Date().toISOString() });
      console.info('[finalize-validation][alert]', message);
    };
    const originalDownload = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = async (options) => {
      window.__liveValidation.downloadCalls.push({ options, timestamp: new Date().toISOString() });
      try {
        const result = await originalDownload(options);
        window.__liveValidation.downloadResults.push({ result, timestamp: new Date().toISOString() });
        return result;
      } catch (error) {
        window.__liveValidation.downloadErrors.push({ message: String(error?.message || error), timestamp: new Date().toISOString() });
        throw error;
      }
    };
  }
  return true;
})()
"@ | Out-Null
}

try {
    $extensionId = Find-ExtensionId
    Reset-Targets $extensionId
    $panelTarget = Get-PanelTarget $extensionId
    $panelSocket = New-CdpSession $panelTarget.webSocketDebuggerUrl
    try {
        Enable-CdpPage $panelSocket
        Install-PanelHooks $panelSocket

        $selectedTest = Invoke-CdpEval $panelSocket @"
(() => {
  const cards = Array.from(document.querySelectorAll('.test-card'));
  const candidates = cards
    .map((card) => {
      const match = card.innerText.match(/(\d+)\s+steps?/i);
      return {
        card,
        text: card.innerText,
        steps: match ? Number(match[1]) : 0,
        attached: /tab attached/i.test(card.innerText)
      };
    })
    .filter((item) => item.attached && item.steps > 0)
    .sort((left, right) => right.steps - left.steps);
  if (candidates.length > 0) {
    candidates[0].card.click();
    return candidates[0].text;
  }
  return 'selected-current';
})()
"@
        Write-RunLog "Selected test card: $selectedTest"

        if (Invoke-CdpEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('On'))()") {
            Click-ElementById $panelSocket 'stopRecording'
            Wait-ForEval $panelSocket "(() => document.getElementById('statusRecording').innerText.includes('Off'))()" 10 'recording off' | Out-Null
        }

        if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('stopPlayback').disabled)()") {
            Click-ElementById $panelSocket 'stopPlayback'
            Start-Sleep -Seconds 1
        }

        Set-InputValue $panelSocket 'scenarioName' 'Live Validation Final 20260402-100752'
        Set-InputValue $panelSocket 'javaClassName' 'LiveValidationFinal20260402100752GeneratedTest'

        $summary = [ordered]@{
            replay = [ordered]@{}
            replayFailure = [ordered]@{}
            finishTest = [ordered]@{}
            save = [ordered]@{}
            export = [ordered]@{}
            generateJava = [ordered]@{}
        }

        Capture-TargetScreenshot $panelSocket '08-replay-running.png'
        $replayDisabled = Invoke-CdpEval $panelSocket "(() => document.getElementById('replayAll').disabled)()"
        if (-not $replayDisabled) {
            Click-ElementById $panelSocket 'replayAll'
            Start-Sleep -Seconds 5
        }
        Capture-TargetScreenshot $panelSocket '09-replay-progress.png'
        Save-PanelSnapshot $panelSocket '21-replay-attempt-state.json'
        $replaySnapshot = Get-Content (Join-Path $LogsDir '21-replay-attempt-state.json') -Raw | ConvertFrom-Json
        Capture-TargetScreenshot $panelSocket '10-replay-success-or-failure.png'
        $summary.replay = @{
            replayDisabled = $replayDisabled
            statusReplay = $replaySnapshot.statusReplay
            replaySummary = $replaySnapshot.replaySummary
            replayError = $replaySnapshot.replayError
        }

        Invoke-CdpEval $panelSocket @"
(() => {
  const cards = Array.from(document.querySelectorAll('.step-card'));
  const target = cards.find((card) => card.innerText.includes('Expect element with'));
  if (!target) throw new Error('Assertion step card not found');
  target.click();
  return true;
})()
"@ | Out-Null
        Wait-ForEval $panelSocket "(() => document.getElementById('stepExpectedValue').value.length > 0)()" 10 'selected assertion step editor' | Out-Null
        Set-InputValue $panelSocket 'stepExpectedValue' 'Logged in as bob'
        Click-ElementById $panelSocket 'applyStepChanges'
        Capture-TargetScreenshot $panelSocket '11-failing-assertion-setup.png'
        if (-not $replayDisabled) {
            Click-ElementById $panelSocket 'replayAll'
            Start-Sleep -Seconds 5
        }
        Capture-TargetScreenshot $panelSocket '12-failing-assertion-message.png'
        Save-PanelSnapshot $panelSocket '22-replay-failure-attempt-state.json'
        $failureSnapshot = Get-Content (Join-Path $LogsDir '22-replay-failure-attempt-state.json') -Raw | ConvertFrom-Json
        $summary.replayFailure = @{
            statusReplay = $failureSnapshot.statusReplay
            replaySummary = $failureSnapshot.replaySummary
            replayError = $failureSnapshot.replayError
        }

        if (Invoke-CdpEval $panelSocket "(() => !document.getElementById('stopPlayback').disabled)()") {
            Click-ElementById $panelSocket 'stopPlayback'
            Start-Sleep -Seconds 1
        }

        $pageCountBeforeFinish = @((Get-ChromeTargets | Where-Object { $_.type -eq 'page' })).Count
        Click-ElementById $panelSocket 'finishTest'
        Start-Sleep -Seconds 2
        Capture-TargetScreenshot $panelSocket '13-finish-test-state.png'
        Save-PanelSnapshot $panelSocket '23-finish-test-state.json'
        $pageCountAfterFinish = @((Get-ChromeTargets | Where-Object { $_.type -eq 'page' })).Count
        $finishSnapshot = Get-Content (Join-Path $LogsDir '23-finish-test-state.json') -Raw | ConvertFrom-Json
        $summary.finishTest = @{
            statusAttachedTab = $finishSnapshot.statusAttachedTab
            recording = $finishSnapshot.statusRecording
            pageCountBefore = $pageCountBeforeFinish
            pageCountAfter = $pageCountAfterFinish
        }

        Click-ElementById $panelSocket 'saveScenario'
        Start-Sleep -Seconds 3
        Capture-TargetScreenshot $panelSocket '14-panel-save-result.png'
        Save-PanelSnapshot $panelSocket '24-save-state.json'
        $saveSnapshot = Get-Content (Join-Path $LogsDir '24-save-state.json') -Raw | ConvertFrom-Json
        $saveList = Invoke-RestMethod -Uri "http://127.0.0.1:17845/api/scenario/list" -TimeoutSec 5
        Save-Json '24-save-scenario-list.json' $saveList
        $summary.save = @{
            alerts = $saveSnapshot.alerts
            listCount = @($saveList.scenarios).Count
        }

        Click-ElementById $panelSocket 'exportScenario'
        Start-Sleep -Seconds 4
        Capture-TargetScreenshot $panelSocket '15-panel-export-result.png'
        Save-PanelSnapshot $panelSocket '25-export-state.json'
        $exportSnapshot = Get-Content (Join-Path $LogsDir '25-export-state.json') -Raw | ConvertFrom-Json
        $summary.export = @{
            downloadCalls = $exportSnapshot.downloadCalls
            downloadResults = $exportSnapshot.downloadResults
            downloadErrors = $exportSnapshot.downloadErrors
        }

        Click-ElementById $panelSocket 'generateJava'
        Start-Sleep -Seconds 3
        Capture-TargetScreenshot $panelSocket '16-panel-generate-java-result.png'
        Save-PanelSnapshot $panelSocket '26-generate-state.json'
        $generateSnapshot = Get-Content (Join-Path $LogsDir '26-generate-state.json') -Raw | ConvertFrom-Json
        $summary.generateJava = @{
            alerts = $generateSnapshot.alerts
            generateDisabled = $generateSnapshot.generateDisabled
        }

        $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $SummaryPath -Encoding UTF8
    } finally {
        $panelSocket.Dispose()
    }
} catch {
    Write-RunLog ("Finalize validation failed: " + $_.Exception.Message)
    throw
}
