param(
  [ValidateSet("debug", "release")]
  [string]$BuildType = "release",

  [string]$VersionName,
  [int]$VersionCode,
  [switch]$Clean,
  [switch]$Bundle,
  [switch]$NoDesktopCopy
)

$ErrorActionPreference = "Stop"

# Marca o início para conseguir provar, no fim, que o APK é desta execução.
$startedAt = Get-Date

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $RootDir "android"
$AppGradle = Join-Path $AndroidDir "app\build.gradle"
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$DistDir = Join-Path $RootDir "dist\apk"

function Read-GradleValue {
  param(
    [string]$Content,
    [string]$Pattern,
    [string]$Fallback
  )

  $match = [regex]::Match($Content, $Pattern)
  if ($match.Success) {
    return $match.Groups[1].Value
  }

  return $Fallback
}

$gradleContent = Get-Content -LiteralPath $AppGradle -Raw

if ($VersionName) {
  $gradleContent = [regex]::Replace($gradleContent, 'versionName\s+"[^"]+"', "versionName `"$VersionName`"")
}

if ($VersionCode -gt 0) {
  $gradleContent = [regex]::Replace($gradleContent, 'versionCode\s+\d+', "versionCode $VersionCode")
}

if ($VersionName -or ($VersionCode -gt 0)) {
  Set-Content -LiteralPath $AppGradle -Value $gradleContent -Encoding UTF8
}

$versionName = Read-GradleValue -Content $gradleContent -Pattern 'versionName\s+"([^"]+)"' -Fallback "0.0"
$versionCode = Read-GradleValue -Content $gradleContent -Pattern 'versionCode\s+(\d+)' -Fallback "0"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$variant = if ($BuildType -eq "release") { "Release" } else { "Debug" }
$gradleTask = "assemble$variant"
$sourceApk = Join-Path $AndroidDir "app\build\outputs\apk\$BuildType\app-$BuildType.apk"
$apkName = "DetailGo-v$versionName-code$versionCode-$BuildType-$stamp.apk"
$distApk = Join-Path $DistDir $apkName
$desktopApk = Join-Path $DesktopDir $apkName

Write-Host "DetailGo APK Builder"
Write-Host "Build: $BuildType"
Write-Host "Version: $versionName ($versionCode)"
Write-Host ""

# $ErrorActionPreference não cobre código de saída de programa externo: se o
# Gradle falhar e ninguém checar $LASTEXITCODE, o script segue, encontra o APK
# da build anterior e o copia como se fosse novo — inclusive para a Área de
# Trabalho. Já aconteceu: um APK antigo foi distribuído achando que era o atual.
function Invoke-Gradle {
  param([string[]]$GradleArgs)

  & .\gradlew.bat @GradleArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle falhou (exit $LASTEXITCODE) em: gradlew $($GradleArgs -join ' ')"
  }
}

Push-Location $AndroidDir
try {
  if ($Clean) {
    Write-Host "Cleaning previous Android build..."
    Invoke-Gradle @("clean")

    # O clean apaga o build/ de TODOS os modulos, inclusive das libs React
    # Native dentro de node_modules. O configureCMake do app inclui as pastas
    # de codegen dessas libs (Android-autolinking.cmake) e falha com CXX1429 se
    # elas ainda nao existirem. O Gradle nao declara essa dependencia, entao
    # regeramos o codegen antes de montar o APK.
    Write-Host "Regenerating codegen artifacts (required after clean)..."
    Invoke-Gradle @("generateCodegenArtifactsFromSchema")
  }

  Write-Host "Generating APK with Gradle task: $gradleTask"
  Invoke-Gradle @($gradleTask)
}
finally {
  Pop-Location
}

if (!(Test-Path -LiteralPath $sourceApk)) {
  throw "APK not found at: $sourceApk"
}

# Segunda rede de proteção: se o APK for anterior ao início desta execução, ele
# é de uma build passada e não deve ser publicado como novo.
$apkWrittenAt = (Get-Item -LiteralPath $sourceApk).LastWriteTime
if ($apkWrittenAt -lt $startedAt) {
  throw "APK em $sourceApk e de $apkWrittenAt, anterior ao inicio desta build ($startedAt). Build nao gerou APK novo."
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $distApk -Force

Write-Host ""
Write-Host "APK generated:"
Write-Host $distApk

if (!$NoDesktopCopy) {
  Copy-Item -LiteralPath $sourceApk -Destination $desktopApk -Force
  Write-Host ""
  Write-Host "Desktop copy:"
  Write-Host $desktopApk
}

$apkInfo = Get-Item -LiteralPath $distApk
$sizeMb = [math]::Round($apkInfo.Length / 1MB, 2)
Write-Host ""
Write-Host "Size: $sizeMb MB"

# A Play Store exige AAB para apps novos; o APK continua servindo para instalar
# direto no aparelho. O AAB sai da mesma build, entao gerar os dois juntos evita
# publicar um bundle de codigo diferente do que foi testado na mao.
if ($Bundle) {
  if ($BuildType -ne "release") {
    throw "AAB so faz sentido em release; rode com -BuildType release."
  }

  Push-Location $AndroidDir
  try {
    Write-Host ""
    Write-Host "Generating AAB with Gradle task: bundleRelease"
    Invoke-Gradle @("bundleRelease")
  }
  finally {
    Pop-Location
  }

  $sourceAab = Join-Path $AndroidDir "app\build\outputs\bundle\release\app-release.aab"
  if (!(Test-Path -LiteralPath $sourceAab)) {
    throw "AAB not found at: $sourceAab"
  }

  # Mesma rede de protecao do APK: bundle anterior a esta execucao e de uma
  # build passada e nao pode ser enviado como novo.
  $aabWrittenAt = (Get-Item -LiteralPath $sourceAab).LastWriteTime
  if ($aabWrittenAt -lt $startedAt) {
    throw "AAB em $sourceAab e de $aabWrittenAt, anterior ao inicio desta build ($startedAt). Build nao gerou AAB novo."
  }

  $aabName = "DetailGo-v$versionName-code$versionCode-$stamp.aab"
  $distAab = Join-Path $DistDir $aabName
  Copy-Item -LiteralPath $sourceAab -Destination $distAab -Force

  $aabMb = [math]::Round((Get-Item -LiteralPath $distAab).Length / 1MB, 2)
  Write-Host ""
  Write-Host "AAB generated (envie este na Play Store):"
  Write-Host $distAab
  Write-Host "Size: $aabMb MB"
}

Write-Host "Done."
