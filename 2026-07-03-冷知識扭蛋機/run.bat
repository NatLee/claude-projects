@echo off
chcp 65001 >nul
REM ===== 冷知識扭蛋機 一鍵啟動 (Windows) =====
cd /d "%~dp0"

echo [1/3] 建立虛擬環境（第一次會花一點時間）...
if not exist ".venv" (
    python -m venv .venv
)

echo [2/3] 安裝套件...
call ".venv\Scripts\activate.bat"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo [3/3] 啟動伺服器...
echo.
echo   打開瀏覽器前往：http://localhost:5000
echo   要停止伺服器請按 Ctrl + C
echo.
python app.py

pause
