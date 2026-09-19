$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$required = @(
  '.\package.json',
  '.\vite.config.ts',
  '.\electron-builder.yml',
  '.\tsconfig.json',
  '.\tsconfig.app.json',
  '.\tsconfig.node.json',
  '.\src\main.tsx',
  '.\src\styles.css',
  '.\src\vite-env.d.ts',
  '.\desktop\package.json',
  '.\desktop\main.cjs',
  '.\desktop\icon.ico'
)
foreach ($file in $required) {
  if (-not (Test-Path $file)) { throw "Required build file is missing: $file" }
}

Write-Host '==> Installing application dependencies'
if (Test-Path '.\node_modules') { Remove-Item '.\node_modules' -Recurse -Force }
if (Test-Path '.\package-lock.json') {
  Write-Host 'package-lock.json found -> using npm ci'
  npm ci --include=optional --no-audit --no-fund
} else {
  Write-Warning 'package-lock.json is missing -> falling back to npm install'
  npm install --include=optional --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host '==> Validating Electron entrypoint'
node --check .\desktop\main.cjs
if ($LASTEXITCODE -ne 0) { throw 'desktop/main.cjs failed syntax validation.' }

Write-Host '==> Running TypeScript validation'
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }

Write-Host '==> Building Vite renderer'
npm run build:renderer
if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }
if (-not (Test-Path '.\dist\index.html')) { throw 'Vite completed without creating dist/index.html.' }

Write-Host '==> Staging the desktop renderer'
if (Test-Path '.\desktop\dist') { Remove-Item '.\desktop\dist' -Recurse -Force }
Copy-Item '.\dist' '.\desktop\dist' -Recurse -Force
if (-not (Test-Path '.\desktop\dist\index.html')) { throw 'desktop/dist/index.html was not staged correctly.' }

Write-Host '==> Installing the pinned packaging tool without changing package.json/package-lock.json'
npm install --no-save --package-lock=false --no-audit --no-fund electron-builder@26.16.1
if ($LASTEXITCODE -ne 0) { throw 'electron-builder installation failed.' }

Write-Host '==> Building Windows x64 NSIS (.exe) and MSI installers with Electron 44.4.3'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npx electron-builder --config electron-builder.yml --win --x64
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }

$exe = @(Get-ChildItem '.\release\*.exe' -File -ErrorAction SilentlyContinue)
$msi = @(Get-ChildItem '.\release\*.msi' -File -ErrorAction SilentlyContinue)
if ($exe.Count -lt 1) { throw 'Packaging finished but no EXE installer was produced.' }
if ($msi.Count -lt 1) { throw 'Packaging finished but no MSI installer was produced.' }

Write-Host '==> Installers created under .\release\'
Get-ChildItem '.\release\*.exe', '.\release\*.msi' -ErrorAction Stop | Select-Object FullName, Length
