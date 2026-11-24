@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
  ) else (
    echo Node.js was not found. Install Node.js LTS from https://nodejs.org and run this again.
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-fund --no-audit || goto :err
)

echo Building AMAN AI...
call npm run build || goto :err

rem Pick the first free port starting at 3000
set PORT=
for /f %%p in ('powershell -NoProfile -Command "$p=3000; while(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue){$p++}; $p"') do set PORT=%%p
if "%PORT%"=="" set PORT=3000

echo.
echo AMAN AI is starting at http://localhost:%PORT%
start "" http://localhost:%PORT%
call npx next start -p %PORT%
goto :eof

:err
echo Something went wrong. See the messages above.
pause
exit /b 1
