@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 推敲 - 每日成語猜謎

if not exist venv (
  echo [1/2] 第一次執行：建立虛擬環境並安裝套件，請稍候...
  python -m venv venv
  call venv\Scripts\activate.bat
  python -m pip install --upgrade pip >nul
  pip install -r requirements.txt
) else (
  call venv\Scripts\activate.bat
)

echo.
echo ============================================================
echo   推敲 已啟動！請用瀏覽器開啟： http://localhost:5000
echo   要停止伺服器：在此視窗按 Ctrl + C，或直接關閉視窗
echo ============================================================
echo.
python app.py
pause
