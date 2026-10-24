@echo off
chcp 65001 > nul
title 🐟 War Of Tuna (참치 전쟁) - 온라인 게임 로비
cd /d "%~dp0"

echo ====================================================
echo  🐟 War Of Tuna (참치 전쟁) 서버를 시작합니다...
echo ====================================================
echo.
echo  브라우저 접속 주소: http://localhost:5000
echo.

start http://localhost:5000
python app.py

pause
