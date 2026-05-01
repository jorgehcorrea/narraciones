# generate-links.ps1
# Authenticates to OneDrive via device code flow, creates anonymous sharing
# links for all narration audio files, and patches catalog.json.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$clientId    = 'de8bc8b5-d9f9-48b1-a8ad-b748da725064'   # Graph Explorer (supports personal MSA)
$tenant      = 'common'
$scopes      = 'Files.ReadWrite offline_access'
$catalogPath = Join-Path $PSScriptRoot 'catalog.json'

# ---------- auth ------------------------------------------------------------
function Get-AccessToken {
    $dcUrl  = "https://login.microsoftonline.com/$tenant/oauth2/v2.0/devicecode"
    $tokUrl = "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token"

    $dc = Invoke-RestMethod -Method Post -Uri $dcUrl -Body @{
        client_id = $clientId
        scope     = $scopes
    }

    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor Cyan
    Write-Host "  1. Your browser will open to:" -ForegroundColor Yellow
    Write-Host "     $($dc.verification_uri)"
    Write-Host ""
    Write-Host "  2. Enter this one-time code:" -ForegroundColor Yellow
    Write-Host "     $($dc.user_code)" -ForegroundColor Green
    Write-Host "  ================================================" -ForegroundColor Cyan
    Write-Host ""
    Start-Process $dc.verification_uri

    Write-Host "  Waiting for sign-in..." -ForegroundColor DarkGray

    $deadline = (Get-Date).AddSeconds($dc.expires_in)
    $interval = [int]$dc.interval

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $interval

        $resp = $null
        $err  = $null
        try {
            $resp = Invoke-RestMethod -Method Post -Uri $tokUrl -Body @{
                grant_type  = 'urn:ietf:params:oauth:grant-type:device_code'
                client_id   = $clientId
                device_code = $dc.device_code
            }
        } catch {
            $err = $_.ErrorDetails.Message
        }

        if ($resp) {
            Write-Host "  Signed in successfully." -ForegroundColor Green
            return $resp.access_token
        }

        if ($err) {
            $errObj  = $null
            try { $errObj = $err | ConvertFrom-Json } catch {}
            $errCode = if ($errObj) { $errObj.error } else { '' }

            if ($errCode -eq 'authorization_pending') { continue }
            if ($errCode -eq 'slow_down') { $interval += 5; continue }
            throw "Token error: $err"
        }
    }
    throw "Authentication timed out."
}

# ---------- Graph helpers ---------------------------------------------------
function Get-DriveItemId($token, $odPath) {
    $segments = $odPath -split '/'
    $encoded  = ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    $uri      = "https://graph.microsoft.com/v1.0/me/drive/root:/$encoded"
    $item     = Invoke-RestMethod -Uri $uri -Headers @{ Authorization = "Bearer $token" }
    return $item.id
}

function New-SharingLink($token, $itemId) {
    $uri  = "https://graph.microsoft.com/v1.0/me/drive/items/$itemId/createLink"
    $body = '{"type":"view","scope":"anonymous"}'
    $resp = Invoke-RestMethod -Method Post -Uri $uri `
        -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
        -Body $body
    return $resp.link.webUrl
}

# ---------- file -> catalog mapping -----------------------------------------
$b = 'Documents/Sound recordings'
$map = @(
    @{ path="$b/El camino del guerrero/El Camino del Guerrero - No Era Idiota.m4a";           book='el-camino-del-guerrero'; ch='cap-01' }
    @{ path="$b/El camino del guerrero/El Camino del Guerrero - Sexto Sentido.m4a";           book='el-camino-del-guerrero'; ch='cap-02' }
    @{ path="$b/El camino del guerrero/El camino de el Guerrero - La tasa vacia.m4a";         book='el-camino-del-guerrero'; ch='cap-03' }
    @{ path="$b/El camino del guerrero/El camino del Geurrrero-El Ronnin Errante.m4a";        book='el-camino-del-guerrero'; ch='cap-04' }
    @{ path="$b/Velazco Ibarra/Introduccion.m4a";                                            book='velazco-ibarra';         ch='intro'  }
    @{ path="$b/When Things Fall Apart/When things fall apart, intro, chapter 1.m4a";         book='when-things-fall-apart'; ch='cap-01' }
    @{ path="$b/When Things Fall Apart/When things fall apart, chapter 2 (part 1 of 2).m4a"; book='when-things-fall-apart'; ch='cap-02a' }
    @{ path="$b/When Things Fall Apart/When things fall apart, chapter 2 (part 2 of 2).m4a"; book='when-things-fall-apart'; ch='cap-02b' }
    @{ path="$b/When Things Fall Apart/when things fall apart, chapter 3.m4a";                book='when-things-fall-apart'; ch='cap-03' }
    @{ path="$b/When Things Fall Apart/when things fall apart, chapter 4.m4a";                book='when-things-fall-apart'; ch='cap-04' }
)

# ---------- main ------------------------------------------------------------
Write-Host ""
Write-Host "  Narraciones - OneDrive Link Generator" -ForegroundColor Cyan
Write-Host "  ======================================" -ForegroundColor Cyan

$token = Get-AccessToken

Write-Host ""
Write-Host "  Generating $($map.Count) sharing links..." -ForegroundColor Yellow
Write-Host ""

# bookId -> chapterId -> url
$results = @{}
$ok = 0
$fail = 0

foreach ($entry in $map) {
    $leaf = Split-Path $entry.path -Leaf
    Write-Host "  $leaf" -NoNewline

    $itemId = $null
    $url    = $null
    $failed = $false

    try {
        $itemId = Get-DriveItemId -token $token -odPath $entry.path
    } catch {
        Write-Host "  [NOT FOUND: $($entry.path)]" -ForegroundColor Red
        $failed = $true
    }

    if (-not $failed) {
        try {
            $url = New-SharingLink -token $token -itemId $itemId
        } catch {
            Write-Host "  [LINK ERROR: $_]" -ForegroundColor Red
            $failed = $true
        }
    }

    if (-not $failed -and $url) {
        Write-Host "  OK" -ForegroundColor Green
        if (-not $results.ContainsKey($entry.book)) { $results[$entry.book] = @{} }
        $results[$entry.book][$entry.ch] = $url
        $ok++
    } else {
        $fail++
    }
}

# ---------- patch catalog.json ----------------------------------------------
Write-Host ""
Write-Host "  Patching catalog.json ($ok links)..." -ForegroundColor Yellow

$catalog = Get-Content $catalogPath -Raw | ConvertFrom-Json

foreach ($book in $catalog.books) {
    if (-not $results.ContainsKey($book.id)) { continue }
    foreach ($ch in $book.chapters) {
        if ($results[$book.id].ContainsKey($ch.id)) {
            $ch.onedrive_url = $results[$book.id][$ch.id]
        }
    }
}

$json = $catalog | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($catalogPath, $json, [System.Text.Encoding]::UTF8)

Write-Host "  Done.  $ok succeeded, $fail failed." -ForegroundColor Green
if ($fail -gt 0) {
    Write-Host "  Check file paths above for any that failed." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Refresh http://localhost/narraciones/ to test playback." -ForegroundColor Cyan
Write-Host ""
