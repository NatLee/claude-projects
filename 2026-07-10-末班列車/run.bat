@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 末班列車
echo ============================================
echo    末班列車 . 深夜發車前的準備
echo ============================================
echo.

REM --- 首次啟動時建立獨立的 Python 環境 ---
if not exist ".venv" (
    echo [1/3] 第一次上車，正在建立 Python 環境...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo 找不到 python 指令。請先確認已安裝 miniconda / Python，
        echo 或改用「說明.md」裡的 conda 方式啟動。
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"

echo [2/3] 安裝相依套件（Flask）...
pip install -q -r requirements.txt

echo [3/3] 發車！
echo.
echo    請用瀏覽器打開：  http://localhost:5000
echo    要讓列車停靠（結束程式），按 Ctrl + C
echo.
python app.py

pause
