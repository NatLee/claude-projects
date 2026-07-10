@echo off
chcp 65001 >nul
REM ============================================================
REM  真的假的？· 冷知識真偽鑑定所  一鍵啟動
REM  需求：已安裝 Python（miniconda 亦可）
REM ============================================================
cd /d "%~dp0"

echo [1/3] 建立虛擬環境（第一次啟動時會花點時間）...
if not exist ".venv" (
    python -m venv .venv
)

echo [2/3] 安裝相依套件（Flask）...
call ".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo [3/3] 啟動伺服器...
echo.
echo   請用瀏覽器打開： http://localhost:5000
echo   要結束伺服器請按 Ctrl + C
echo.
call ".venv\Scripts\python.exe" app.py

pause
