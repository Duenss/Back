@echo off
REM Script para preparar el código para AWS Elastic Beanstalk
REM Elimina archivos innecesarios y comprime

echo.
echo ====================================================
echo  Preparando Back-main para AWS Elastic Beanstalk
echo ====================================================
echo.

REM Cambiar a directorio
cd /d "%~dp0"

REM Eliminar node_modules y carpetas no necesarias
echo [1/4] Eliminando node_modules y carpetas temporales...
if exist node_modules rmdir /s /q node_modules
if exist .git rmdir /s /q .git
if exist coverage rmdir /s /q coverage
if exist .nyc_output rmdir /s /q .nyc_output

REM Eliminar archivos de log
echo [2/4] Limpiando archivos de log...
for /r %%f in (*.log) do del /q "%%f"
if exist npm-debug.log del npm-debug.log
if exist yarn-error.log del yarn-error.log

REM Instalar dependencias de producción
echo [3/4] Instalando dependencias de producción...
call npm ci --only=production

REM Comprimir
echo [4/4] Comprimiendo para AWS...
cd /d "%~dp0"
cd ..

powershell -NoProfile -Command "Set-Location 'back-aws'; Get-ChildItem -Recurse | Compress-Archive -DestinationPath '../back-aws.zip' -Force"

echo [5/5] Validando back-aws.zip...
if exist "back-aws.zip" (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead('back-aws.zip'); $found = $zip.Entries | Where-Object { $_.FullName -ieq 'Dockerrun.aws.json' }; if ($found) { Write-Host 'OK: Dockerrun.aws.json encontrado en back-aws.zip' } else { Write-Host 'ERROR: Dockerrun.aws.json NO se encontró en back-aws.zip'; exit 1 }; $zip.Dispose();"
) else (
  echo ERROR: back-aws.zip no se creó.
  exit /b 1
)

echo.
echo ====================================================
echo  ✅ LISTO PARA SUBIR A AWS (Docker)
echo ====================================================
echo.
echo Archivo comprimido: back-aws.zip
echo.
echo Opciones de deployment:
echo.
echo 1. AWS ELASTIC BEANSTALK CLI:
echo    eb init -p docker authplatform-backend --region us-east-1
echo    eb create authplatform-prod --instance-type t3.micro
echo    eb deploy
echo.
echo 2. AWS CONSOLE MANUAL:
echo    https://console.aws.amazon.com/elasticbeanstalk
echo    - Create Application
 echo    - Platform: Docker
echo    - Upload back-aws.zip
echo    - Configure environment variables
echo.
echo Documentación: back-aws\README_AWS.md
echo.
pause
