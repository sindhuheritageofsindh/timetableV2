$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '==> Installing application dependencies'
if (Test-Path '.\package-lock.json') {
  Write-Host 'package-lock.json found -> using npm ci'
  npm ci --no-audit --no-fund
} else {
  Write-Warning 'package-lock.json is missing -> falling back to npm install'
  npm install --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host '==> Running production type-check and renderer build'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }

Write-Host '==> Staging the desktop renderer'
if (Test-Path '.\desktop\dist') { Remove-Item '.\desktop\dist' -Recurse -Force }
Copy-Item '.\dist' '.\desktop\dist' -Recurse -Force

Write-Host '==> Installing the pinned packaging tool without changing package.json/package-lock.json'
npm install --no-save --package-lock=false --no-audit --no-fund electron-builder@26.16.1
if ($LASTEXITCODE -ne 0) { throw 'electron-builder installation failed.' }

Write-Host '==> Building Windows x64 NSIS (.exe) and MSI installers with Electron 44.4.3'
npx electron-builder --config electron-builder.yml --win --x64
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }

Write-Host '==> Installers created under .\release\'
$installers = Get-ChildItem '.\release\*.exe', '.\release\*.msi' -ErrorAction Stop
$installers | Select-Object FullName, Length
