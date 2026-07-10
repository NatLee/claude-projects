@echo off
chcp 65001 >nul
title 費米的餐巾紙
echo ====================================
echo   費米的餐巾紙 — 啟動中...
echo ====================================
echo.

REM 進到此 .bat 所在資料夾
cd /d "%~dp0"

REM 若沒有虛擬環境就建立一個
if not exist ".venv\" (
    echo [1/3] 第一次啟動，正在建立 Python 虛擬環境...
    python -m venv .venv
)

echo [2/3] 安裝相依套件（Flask）...
call ".venv\Scripts\activate.bat"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo [3/3] 啟動伺服器...
echo.
echo   請用瀏覽器打開： http://localhost:5000
echo   要結束請按 Ctrl + C
echo.
python app.py

pause
