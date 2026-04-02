param(
    [int]$Port = 17846,
    [string]$Root = "C:\dev\uitool\testingtheapp\fixtures"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $Root)) {
    throw "Fixture root does not exist: $Root"
}

function Get-ContentType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.js' { return 'application/javascript; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.png' { return 'image/png' }
        '.jpg' { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.svg' { return 'image/svg+xml' }
        default { return 'application/octet-stream' }
    }
}

function Resolve-RequestPath([string]$RequestPath) {
    $relativePath = if ([string]::IsNullOrWhiteSpace($RequestPath) -or $RequestPath -eq '/') {
        'recorder-test-page.html'
    } else {
        [System.Uri]::UnescapeDataString($RequestPath.TrimStart('/'))
    }

    $combinedPath = Join-Path $Root $relativePath
    $fullRoot = [System.IO.Path]::GetFullPath($Root)
    $fullPath = [System.IO.Path]::GetFullPath($combinedPath)

    if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Blocked path outside fixture root: $RequestPath"
    }

    return $fullPath
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $requestPath = $context.Request.Url.AbsolutePath
            $targetPath = Resolve-RequestPath $requestPath
            if (-not (Test-Path $targetPath -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $payload = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                $context.Response.ContentType = 'text/plain; charset=utf-8'
                $context.Response.OutputStream.Write($payload, 0, $payload.Length)
                continue
            }

            $bytes = [System.IO.File]::ReadAllBytes($targetPath)
            $context.Response.StatusCode = 200
            $context.Response.ContentType = Get-ContentType $targetPath
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $context.Response.StatusCode = 500
            $payload = [System.Text.Encoding]::UTF8.GetBytes([string]$_.Exception.Message)
            $context.Response.ContentType = 'text/plain; charset=utf-8'
            $context.Response.OutputStream.Write($payload, 0, $payload.Length)
        } finally {
            $context.Response.OutputStream.Close()
            $context.Response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
