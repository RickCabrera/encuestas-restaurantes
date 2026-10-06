# Arma el Setup.exe de Windows. Lo usa .github/workflows/instalador-pc.yml; tambien corre
# en una PC de desarrollo (sin instalar nada: solo descarga, compila y empaqueta).
#
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1 -Version 1.0.0
#
# Deja el paquete en installer\build\payload y, si Inno Setup 6 esta instalado, el Setup.exe
# en installer\build\out. Con -SkipSetup solo arma el paquete.
param(
  [string]$Version = '0.0.0',
  [switch]$SkipSetup
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "La version debe ser X.Y.Z (recibi '$Version')." }

$Root = Split-Path -Parent $PSScriptRoot
$Build = Join-Path $PSScriptRoot 'build'
$Cache = Join-Path $Build 'cache'
$Payload = Join-Path $Build 'payload'
$Out = Join-Path $Build 'out'
$Versions = Get-Content (Join-Path $PSScriptRoot 'versions.json') -Raw | ConvertFrom-Json
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Step([string]$Text) { Write-Host "`n=== $Text ===" }

function Invoke-Cmd([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What fallo (codigo $LASTEXITCODE)." }
}

# Descarga a la cache y verifica el SHA-256 fijado en versions.json.
function Get-Download($Item, [string]$Name) {
  $file = Join-Path $Cache $Name
  if (-not (Test-Path $file)) {
    Write-Host "Descargando $Name..."
    Invoke-WebRequest -Uri $Item.url -OutFile "$file.tmp" -UseBasicParsing
    Move-Item "$file.tmp" $file -Force
  }
  if ($Item.sha256) {
    $hash = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $Item.sha256) {
      Remove-Item $file -Force
      throw "SHA-256 inesperado en ${Name}: $hash (se esperaba $($Item.sha256))."
    }
  }
  return $file
}

# Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI y rompe los acentos.
function Copy-WithBom([string]$Source, [string]$Destination) {
  [System.IO.File]::WriteAllText($Destination, [System.IO.File]::ReadAllText($Source, [System.Text.Encoding]::UTF8), $Utf8Bom)
}

Step 'Carpetas'
foreach ($dir in @($Payload, $Out)) { if (Test-Path $dir) { Remove-Item $dir -Recurse -Force } }
foreach ($dir in @($Cache, $Payload, $Out)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

Step 'Descargas'
$nodeZip = Get-Download $Versions.node "node-$($Versions.node.version).zip"
$pgZip = Get-Download $Versions.postgres "postgresql-$($Versions.postgres.version).zip"
$winsw = Get-Download $Versions.winsw "winsw-$($Versions.winsw.version).exe"
$vcRedist = Get-Download $Versions.vcredist 'vc_redist.x64.exe'
# El enlace de Microsoft siempre trae la ultima version: se verifica la firma en vez de un hash.
$signature = Get-AuthenticodeSignature -FilePath $vcRedist
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
  throw "vc_redist.x64.exe no trae una firma valida de Microsoft ($($signature.Status))."
}

Step 'Build de Next.js (APP_MODE=local, standalone)'
Push-Location $Root
try {
  $env:APP_MODE = 'local'
  $env:NEXT_TELEMETRY_DISABLED = '1'
  # El build no consulta la base, pero los modulos exigen que las variables existan.
  if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgres://build:build@127.0.0.1:5433/build' }
  if (-not $env:AUTH_SECRET) { $env:AUTH_SECRET = 'solo-para-compilar-0123456789abcdef0123456789' }
  $distDir = if ($env:NEXT_DIST_DIR) { $env:NEXT_DIST_DIR } else { '.next' }
  if (Test-Path (Join-Path $distDir 'standalone')) { Remove-Item (Join-Path $distDir 'standalone') -Recurse -Force }
  Invoke-Cmd 'next build' { npm run build }

  $standalone = Join-Path $Root "$distDir\standalone"
  if (-not (Test-Path (Join-Path $standalone 'server.js'))) {
    throw "No se genero $standalone\server.js. Revisa que no haya un package-lock.json en una carpeta superior."
  }

  Step 'App'
  $app = Join-Path $Payload 'app'
  Copy-Item $standalone $app -Recurse
  Copy-Item (Join-Path $Root 'public') (Join-Path $app 'public') -Recurse
  Copy-Item (Join-Path $Root "$distDir\static") (Join-Path $app "$distDir\static") -Recurse
  # El .env de quien compila (si lo hay) jamas viaja en el instalador.
  Get-ChildItem -Path $app -Force -Filter '.env*' | Remove-Item -Force
  if (Get-ChildItem -Path $app -Force -Recurse -Filter '.env*') { throw 'Quedo un archivo .env dentro del paquete.' }

  Step 'Herramientas (migraciones, enlace de alta, restablecer contrasena)'
  $tools = Join-Path $Payload 'tools'
  New-Item -ItemType Directory -Force -Path (Join-Path $tools 'js') | Out-Null
  # El seed no se empaqueta: la version instalada nunca lo corre.
  Invoke-Cmd 'esbuild' {
    npx --no-install esbuild scripts/migrate.ts scripts/invite-org.ts scripts/reset-admin-password.ts `
      --bundle --platform=node --target=node22 --format=cjs --tsconfig=tsconfig.json `
      '--out-extension:.js=.cjs' "--outdir=$(Join-Path $tools 'js')" --log-level=warning
  }
  Copy-Item (Join-Path $Root 'drizzle') (Join-Path $tools 'drizzle') -Recurse
} finally {
  Pop-Location
}

foreach ($script in (Get-ChildItem (Join-Path $PSScriptRoot 'scripts') -Filter '*.ps1')) {
  Copy-WithBom $script.FullName (Join-Path $tools $script.Name)
}
Copy-Item (Join-Path $PSScriptRoot 'scripts\listo.template.html') $tools

Step 'Node, PostgreSQL, WinSW y runtime de Visual C++'
$extract = Join-Path $Build 'extract'
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $extract 'node')
$nodeDir = Get-ChildItem (Join-Path $extract 'node') -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path (Join-Path $Payload 'node') | Out-Null
Copy-Item (Join-Path $nodeDir.FullName 'node.exe') (Join-Path $Payload 'node')
Copy-Item (Join-Path $nodeDir.FullName 'LICENSE') (Join-Path $Payload 'node\LICENSE.txt')

# Del zip de EDB solo se necesita el servidor: sin pgAdmin, StackBuilder, documentacion ni cabeceras.
Invoke-Cmd 'Extraer PostgreSQL' { & (Join-Path $env:SystemRoot 'System32\tar.exe') -xf $pgZip -C $extract pgsql/bin pgsql/lib pgsql/share pgsql/server_license.txt pgsql/commandlinetools_3rd_party_licenses.txt }
Move-Item (Join-Path $extract 'pgsql') (Join-Path $Payload 'pgsql')

New-Item -ItemType Directory -Force -Path (Join-Path $Payload 'services'), (Join-Path $Payload 'redist') | Out-Null
Copy-Item $winsw (Join-Path $Payload 'services\winsw.exe')
Copy-Item $vcRedist (Join-Path $Payload 'redist\vc_redist.x64.exe')
[System.IO.File]::WriteAllText((Join-Path $Payload 'version.txt'), $Version)
Remove-Item $extract -Recurse -Force

$size = [math]::Round(((Get-ChildItem $Payload -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
Write-Host "Paquete: $Payload ($size MB)"

if ($SkipSetup) { return }

Step 'Setup.exe (Inno Setup)'
$iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
  $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $iscc) { throw 'No se encontro Inno Setup 6 (ISCC.exe). Instalalo o usa -SkipSetup.' }
# Inno Setup necesita el .iss en UTF-8 con BOM para los acentos.
$iss = Join-Path $Build 'setup.iss'
Copy-WithBom (Join-Path $PSScriptRoot 'setup.iss') $iss
Invoke-Cmd 'ISCC' { & $iscc /Qp "/DAppVersion=$Version" "/DPgMajor=$($Versions.postgres.major)" "/DPayloadDir=$Payload" "/DOutputDir=$Out" $iss }

$setup = Get-ChildItem $Out -Filter '*.exe' | Select-Object -First 1
$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
[System.IO.File]::WriteAllText("$($setup.FullName).sha256", "$hash  $($setup.Name)`n")
Write-Host "Setup: $($setup.FullName) ($([math]::Round($setup.Length / 1MB, 0)) MB)"
Write-Host "SHA-256: $hash"
