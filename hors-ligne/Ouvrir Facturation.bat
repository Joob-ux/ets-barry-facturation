@echo off
rem Ouvre la facturation Ets Barry dans Edge. Les factures sont gardees dans donnees-factures.json.
cd /d "%~dp0"
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0serveur.ps1"
ping -n 3 127.0.0.1 >nul
start "" "microsoft-edge:http://localhost:8765/"
