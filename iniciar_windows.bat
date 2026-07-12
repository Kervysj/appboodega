@echo off
cd /d "%~dp0"
echo Iniciando Bodega...
echo No cierres esta ventana mientras uses el sistema.
start http://localhost:8080
python -m http.server 8080
pause
