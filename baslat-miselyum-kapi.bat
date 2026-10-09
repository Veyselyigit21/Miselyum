@echo off
rem Miselyum Kapisi: giris paneli, oturum ve yetki korumalari, 95 sanal OCPP sarj cihaziyla canli mod.
rem Pencereyi kapatinca Kapi ve sanal cihazlar da kapanir.
cd /d "%~dp0"
set "PY=python"
where python >nul 2>nul || set "PY=py"
%PY% -c "import aiohttp, websockets, ocpp, cryptography" >nul 2>nul
if not errorlevel 1 goto basla
echo Gerekli Python paketleri eksik: aiohttp, websockets, ocpp, cryptography
set /p KUR="Simdi kurulsun mu? (E/H): "
if /i not "%KUR%"=="E" goto son
%PY% -m pip install -r kapi\gereksinimler.txt
if errorlevel 1 goto son
:basla
echo.
echo Miselyum Kapisi: http://127.0.0.1:8770
echo Demo hesaplari : kapi\veri\demo-hesaplar.txt (ilk calistirmada olusur)
echo Yonetici kodu  : %PY% kapi\totp.py
echo Savunma testi  : %PY% kapi\saldiri_testleri.py
echo Kapatmak icin bu pencereyi kapatin.
echo.
start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://127.0.0.1:8770/"
%PY% kapi\kapi.py
:son
pause
