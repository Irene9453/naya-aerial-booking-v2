$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot ".env.emulator.local"

if (-not (Test-Path $envFile)) {
    throw "找不到 Emulator 測試環境設定檔"
}

# 讀取測試環境變數
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable(
            $name,
            $value,
            "Process"
        )
    }
}

# 移除正式 Firebase Admin 憑證，避免測試時使用
Remove-Item Env:FIREBASE_ADMIN_CLIENT_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:FIREBASE_ADMIN_PRIVATE_KEY -ErrorAction SilentlyContinue

# 安全檢查
if (
    $env:NEXT_PUBLIC_USE_FIREBASE_EMULATOR -ne "true" -or
    $env:NEXT_PUBLIC_FIREBASE_PROJECT_ID -ne "demo-naya-aerial" -or
    $env:FIREBASE_ADMIN_PROJECT_ID -ne "demo-naya-aerial" -or
    $env:FIRESTORE_EMULATOR_HOST -ne "127.0.0.1:8080" -or
    $env:FIREBASE_AUTH_EMULATOR_HOST -ne "127.0.0.1:9099"
) {
    throw "安全檢查失敗：禁止啟動測試網站"
}

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Naya Aerial Booking Emulator Mode" -ForegroundColor Cyan
Write-Host "===================================="
Write-Host "測試專案：demo-naya-aerial"
Write-Host "Firestore：127.0.0.1:8080"
Write-Host "Authentication：127.0.0.1:9099"
Write-Host "正式 Admin 憑證：已從目前程序移除"
Write-Host "安全檢查：PASS" -ForegroundColor Green

# 暫時不啟動網站，先確認設定

# 確認正式環境設定已隔離
if (Test-Path (Join-Path $PSScriptRoot ".env.local")) {
    throw "安全限制：偵測到正式 .env.local，禁止啟動測試網站"
}

# 確認正式環境備份存在
if (-not (Test-Path (Join-Path $PSScriptRoot ".env.production.backup"))) {
    throw "安全限制：找不到正式環境備份"
}

# 確認測試環境沒有使用正式憑證
if (
    $env:FIREBASE_ADMIN_CLIENT_EMAIL -or
    $env:FIREBASE_ADMIN_PRIVATE_KEY
) {
    throw "安全限制：測試環境不應包含正式 Firebase Admin 憑證"
}

Write-Host ""
Write-Host "正式環境已隔離：PASS" -ForegroundColor Green
Write-Host "準備啟動 Next.js 測試網站..." -ForegroundColor Cyan

Set-Location $PSScriptRoot
npm run dev
