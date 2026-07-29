$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$exampleFile = Join-Path $projectDir ".env.docker.example"
$targetFile = Join-Path $projectDir ".env"
$localFile = Join-Path $projectDir ".env.local"

function Set-EnvValue([string] $content, [string] $key, [string] $value) {
    $escapedKey = [System.Text.RegularExpressions.Regex]::Escape($key)
    $evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
        param($match)
        return "${key}=${value}"
    }
    return [System.Text.RegularExpressions.Regex]::Replace(
        $content,
        "(?m)^${escapedKey}=.*\r?$",
        $evaluator
    )
}

if (Test-Path $targetFile) {
    $existingContent = [System.IO.File]::ReadAllText($targetFile)
    foreach ($requiredKey in @(
        "POSTGRES_PASSWORD",
        "N8N_ENCRYPTION_KEY",
        "N8N_RUNNERS_AUTH_TOKEN"
    )) {
        $escapedKey = [System.Text.RegularExpressions.Regex]::Escape($requiredKey)
        $requiredMatches = [System.Text.RegularExpressions.Regex]::Matches(
            $existingContent,
            "(?m)^${escapedKey}=(.*)\r?$"
        )
        if ($requiredMatches.Count -ne 1) {
            Write-Error "${requiredKey} harus muncul tepat satu kali pada .env."
        }
        $requiredValue = $requiredMatches[0].Groups[1].Value.TrimEnd("`r").Trim()
        if (
            $requiredValue.Length -ge 2 -and
            (
                (
                    $requiredValue[0] -eq [char] 34 -and
                    $requiredValue[$requiredValue.Length - 1] -eq [char] 34
                ) -or
                (
                    $requiredValue[0] -eq [char] 39 -and
                    $requiredValue[$requiredValue.Length - 1] -eq [char] 39
                )
            )
        ) {
            $requiredValue = $requiredValue.Substring(1, $requiredValue.Length - 2)
        }
        $placeholderProbe = $requiredValue.Trim()
        if (
            [string]::IsNullOrWhiteSpace($requiredValue) -or
            $placeholderProbe.StartsWith("__GENERATE_")
        ) {
            Write-Error "${requiredKey} pada .env masih kosong atau berupa placeholder."
        }
        if ($requiredValue.Length -lt 32) {
            Write-Error "${requiredKey} pada .env minimal 32 karakter."
        }
    }
    Write-Host "File .env sudah ada; secret wajib lolos pemeriksaan. Tidak ada file yang ditimpa."
    exit 0
}

function New-HexSecret([int] $byteCount) {
    $bytes = New-Object byte[] $byteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

$content = [System.IO.File]::ReadAllText($exampleFile)
$content = Set-EnvValue $content "POSTGRES_PASSWORD" (New-HexSecret 24)
$content = Set-EnvValue $content "N8N_ENCRYPTION_KEY" (New-HexSecret 32)
$content = Set-EnvValue $content "N8N_RUNNERS_AUTH_TOKEN" (New-HexSecret 32)

if (Test-Path $localFile) {
    $allowedKeys = @(
        "VITE_SUMAI_COMPANY_ID",
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID",
        "VITE_FIREBASE_MEASUREMENT_ID"
    )

    foreach ($line in [System.IO.File]::ReadAllLines($localFile)) {
        if ($line -notmatch "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
            continue
        }
        $key = $Matches[1]
        $value = $Matches[2]
        if ($allowedKeys -contains $key) {
            $content = Set-EnvValue $content $key $value
        }
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tempFile = Join-Path $projectDir (".env.docker.tmp." + [Guid]::NewGuid().ToString("N"))
try {
    [System.IO.File]::WriteAllText($tempFile, $content, $utf8NoBom)
    Move-Item -LiteralPath $tempFile -Destination $targetFile
}
finally {
    if (Test-Path $tempFile) {
        Remove-Item -LiteralPath $tempFile -Force
    }
}

Write-Host "File .env berhasil dibuat."
Write-Host "Periksa URL dan konfigurasi Firebase, lalu jalankan: docker compose config --quiet"
Write-Host "Jika valid, jalankan: docker compose up -d --build"
