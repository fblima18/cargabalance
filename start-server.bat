@echo off
title CargaBalance // CT-e & MDF-e Platform
echo ========================================================
echo   CARGABALANCE - PLATAFORMA DE AUDITORIA CT-e / MDF-e
echo ========================================================
echo.
echo Iniciando servidor local...
cd /d "%~dp0"
node src/server.js
pause
