@echo off
setlocal
title Compilar Contabilizador de Comissoes

pushd "%~dp0"
echo Instalando dependencias verificadas...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :erro
echo Gerando portateis para Windows x64 e x86...
call npm run build:app
if errorlevel 1 goto :erro
echo.
echo Compilacao concluida. Consulte a pasta release.
popd
pause
exit /b 0

:erro
echo.
echo A compilacao falhou. Revise as mensagens acima.
popd
pause
exit /b 1
