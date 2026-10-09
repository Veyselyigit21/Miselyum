@echo off
rem Miselyum'u Kapi olmadan, yalniz yerel sunucuyla acar (simulasyon modu). Boylece asistan bilgisayardaki Ollama modeline baglanabilir.
rem Giris paneli ve canli cihazlar icin baslat-miselyum-kapi.bat dosyasini kullanin.
rem Pencereyi kapatinca sunucu da kapanir.
cd /d "%~dp0"
echo Miselyum yerel sunucu (simulasyon): http://localhost:8765/baslat.html
echo Kapatmak icin bu pencereyi kapatin.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8765/baslat.html"
rem Yalniz panel dosyalari sunulur; kapi\veri altindaki veritabani ve hesaplar sunulmaz
where python >nul 2>nul
if %errorlevel%==0 (
  python kapi\statik_sunucu.py 8765
) else (
  py kapi\statik_sunucu.py 8765
)
pause
