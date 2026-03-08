@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在检查 Python...
python --version
if errorlevel 1 (
    echo 未检测到 Python，请先安装 Python 并勾选 "Add to PATH"
    pause
    exit /b 1
)

echo.
echo 正在检查依赖...
pip show flask >nul 2>&1
if errorlevel 1 (
    echo 正在安装 Flask...
    pip install -r requirements.txt
)

echo.
echo 正在启动服务...
start "智能理财服务" python app.py
timeout /t 3 /nobreak >nul
echo 打开浏览器...
start http://127.0.0.1:8080
echo.
echo 服务已在后台运行，关闭本窗口不影响服务。
echo 若要停止服务，请关闭标题为「智能理财服务」的窗口。
pause

