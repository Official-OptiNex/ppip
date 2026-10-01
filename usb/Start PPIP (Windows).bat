@echo off
rem ---------------------------------------------------------------
rem  PPIP - Parts & PM  (portable, no install needed)
rem  Opens the app in its own window using Microsoft Edge, which is
rem  on every Windows 10/11 PC. Your sign-in is kept on this USB stick.
rem  All data lives online, so every USB stick and browser stays in sync.
rem ---------------------------------------------------------------
setlocal
set "HERE=%~dp0"
set "PAGE=%HERE%app\index.html"
set "URL=file:///%PAGE:\=/%"
set "PROFILE=%HERE%.browser-profile"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --user-data-dir="%PROFILE%" --no-first-run --window-size=1400,900
  goto :eof
)
if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%" --user-data-dir="%PROFILE%" --no-first-run --window-size=1400,900
  goto :eof
)
rem Fallback: default browser
start "" "%PAGE%"
