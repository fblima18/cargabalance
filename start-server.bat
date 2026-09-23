@echo off
title CARGA BALANCE - Auditoria de frete
echo ========================================================
echo   CARGA BALANCE - AUDITORIA DE FRETE
echo ========================================================
echo.
echo Iniciando servidor local...
cd /d "%~dp0"
node src/server.js
pause
