@echo off
echo ============================================
echo   FITPRICE Quick Start - Windows
echo ============================================

REM Check Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js ar aris dayenebuli. https://nodejs.org
    pause & exit /b 1
)

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python ar aris dayenebuli. https://python.org
    pause & exit /b 1
)

REM Create .env.local for frontend
if not exist "frontend\.env.local" (
    echo NEXT_PUBLIC_API_URL=http://localhost:4000 > frontend\.env.local
)

REM Install Node backend deps
echo [1/3] Backend deps...
cd backend
npm install
cd ..

REM Install frontend deps
echo [2/3] Frontend deps...
cd frontend
npm install
cd ..

REM Install Python deps
echo [3/3] Python deps...
cd python-service
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
deactivate
cd ..

echo.
echo ============================================
echo  3 CMD ginda gashvebistvis:
echo.
echo  CMD 1 (Python):
echo    cd python-service
echo    venv\Scripts\activate
echo    uvicorn main:app --reload --port 8000
echo.
echo  CMD 2 (Backend):
echo    cd backend
echo    npm run dev
echo.
echo  CMD 3 (Frontend):
echo    cd frontend
echo    npm run dev
echo.
echo  Shemdem gaxseni: http://localhost:3000
echo ============================================
pause
