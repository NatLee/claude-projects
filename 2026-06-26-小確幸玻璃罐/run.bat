@echo off
chcp 65001 >nul
cd /d %~dp0

echo ==========================================
echo   小確幸玻璃罐 Jar of Small Joys
echo ==========================================
echo.

REM 建立並啟用虛擬環境（第一次會比較久）
if not exist .venv (
    echo [1/3] 建立虛擬環境 .venv ...
    python -m venv .venv
)
call .venv\Scripts\activate

echo [2/3] 安裝相依套件 ...
pip install -q -r requirements.txt

echo [3/3] 啟動伺服器
echo.
echo   請用瀏覽器打開： http://localhost:5000
echo   要關閉伺服器：在本視窗按 Ctrl + C
echo.
python app.py

pause
