@echo off
setlocal enabledelayedexpansion

chcp 65001 >nul
title Century Sip - Android Build Utility

:: Determine mobile-app path
if exist "%~dp0mobile-app\package.json" (
    set "APP_DIR=%~dp0mobile-app"
) else if exist "%~dp0package.json" (
    set "APP_DIR=%~dp0"
) else (
    echo [ERROR] Could not find mobile-app directory.
    echo Please run this script from the project root or mobile-app folder.
    pause
    exit /b 1
)

cd /d "%APP_DIR%"
set EXPO_NO_TELEMETRY=1

:: Direct CLI argument handling
if /i "%~1"=="apk" goto :build_apk
if /i "%~1"=="preview" goto :build_apk
if /i "%~1"=="aab" goto :build_aab
if /i "%~1"=="prod" goto :build_aab
if /i "%~1"=="production" goto :build_aab
if /i "%~1"=="local" goto :build_local
if /i "%~1"=="dev" goto :start_dev
if /i "%~1"=="exit" goto :exit

:menu
cls
echo =====================================================================
echo                 CENTURY SIP - ANDROID BUILD UTILITY
echo =====================================================================
echo.
echo   [1] Build Installable APK (.apk) via EAS Cloud (Recommended)
echo       - Ready to download and install directly on any Android phone.
echo       - Zero local Android SDK / Java setup required.
echo.
echo   [2] Build Play Store App Bundle (.aab) via EAS Cloud
echo       - Production release bundle for Google Play Console submission.
echo.
echo   [3] Build APK Locally on your PC (Requires JDK 17+ and Android SDK)
echo       - Runs expo prebuild and gradle assembleRelease offline.
echo.
echo   [4] Start Expo Development Server
echo       - Runs expo start --clear for live testing.
echo.
echo   [5] Login / Check Expo (EAS) Account
echo       - Authenticate with your Expo EAS account.
echo.
echo   [6] Exit
echo.
echo =====================================================================
set /p "CHOICE=Enter your choice (1-6) [Default: 1]: "

if "%CHOICE%"=="" set CHOICE=1
if "%CHOICE%"=="1" goto :build_apk
if "%CHOICE%"=="2" goto :build_aab
if "%CHOICE%"=="3" goto :build_local
if "%CHOICE%"=="4" goto :start_dev
if "%CHOICE%"=="5" goto :eas_login
if "%CHOICE%"=="6" goto :exit

echo [ERROR] Invalid selection "%CHOICE%".
timeout /t 2 >nul
goto :menu

:: -----------------------------------------------------------------------
:: 1. EAS Cloud APK Build
:: -----------------------------------------------------------------------
:build_apk
cls
echo =====================================================================
echo       BUILDING STANDALONE ANDROID APK (.apk) VIA EAS CLOUD
echo =====================================================================
echo.
echo Target Profile: preview (buildType: apk)
echo Output: Direct APK download link + QR code for your Android device.
echo Working Directory: %APP_DIR%
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH. Please install Node.js.
    pause
    goto :menu
)

echo Starting EAS build process...
echo (If prompted, log in with your Expo account or press Ctrl+C to cancel)
echo.
call npx eas-cli build --platform android --profile preview

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo [SUCCESS] APK Build completed successfully!
    echo Download link and QR code are displayed above.
    echo =====================================================================
) else (
    echo.
    echo [WARNING] EAS build exited with error code %errorlevel%.
    echo If this is an authentication issue, choose option [5] to log in.
)
echo.
pause
goto :menu

:: -----------------------------------------------------------------------
:: 2. EAS Cloud Production AAB Build
:: -----------------------------------------------------------------------
:build_aab
cls
echo =====================================================================
echo     BUILDING PRODUCTION PLAY STORE BUNDLE (.aab) VIA EAS CLOUD
echo =====================================================================
echo.
echo Target Profile: production (Play Store .aab)
echo Working Directory: %APP_DIR%
echo.

call npx eas-cli build --platform android --profile production

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo [SUCCESS] Production Bundle (.aab) completed successfully!
    echo =====================================================================
) else (
    echo.
    echo [WARNING] Build exited with code %errorlevel%.
)
echo.
pause
goto :menu

:: -----------------------------------------------------------------------
:: 3. Local Offline Build (Prebuild + Gradle)
:: -----------------------------------------------------------------------
:build_local
cls
echo =====================================================================
echo                 LOCAL ANDROID BUILD (PREBUILD + GRADLE)
echo =====================================================================
echo.

:: 1. Verify Java JDK
where javac >nul 2>nul
if %errorlevel% neq 0 (
    if not defined JAVA_HOME (
        echo [ERROR] Java Development Kit (JDK 17) was not detected on this PC.
        echo.
        echo To build locally, you need:
        echo   1. JDK 17 (e.g. Eclipse Temurin or Oracle JDK 17)
        echo   2. Android Studio with Android SDK 34+
        echo.
        echo RECOMMENDED: Use Option [1] (EAS Cloud Build) which builds the APK
        echo in the cloud with zero local setup needed!
        echo.
        pause
        goto :menu
    )
)

:: 2. Verify Android SDK
if not defined ANDROID_HOME (
    if not defined ANDROID_SDK_ROOT (
        if not exist "%LOCALAPPDATA%\Android\Sdk" (
            echo [ERROR] ANDROID_HOME environment variable is not set.
            echo Android SDK is required for local offline compilation.
            echo.
            echo RECOMMENDED: Use Option [1] (EAS Cloud Build) instead.
            echo.
            pause
            goto :menu
        ) else (
            set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
        )
    )
)

echo Prebuilding native Android project files...
call npx expo prebuild --platform android --clean
if %errorlevel% neq 0 (
    echo [ERROR] Expo prebuild failed.
    pause
    goto :menu
)

echo.
echo Running Gradle Release Build...
cd android
call gradlew.bat assembleRelease
set "BUILD_STATUS=%errorlevel%"
cd ..

if %BUILD_STATUS% equ 0 (
    echo.
    echo =====================================================================
    echo [SUCCESS] Local Release APK generated!
    echo APK Location:
    dir /s /b "%APP_DIR%\android\app\build\outputs\apk\release\*.apk" 2>nul
    echo =====================================================================
) else (
    echo.
    echo [ERROR] Gradle build failed with code %BUILD_STATUS%.
)
echo.
pause
goto :menu

:: -----------------------------------------------------------------------
:: 4. Start Expo Dev Server
:: -----------------------------------------------------------------------
:start_dev
cls
echo =====================================================================
echo                 STARTING EXPO DEVELOPMENT SERVER
echo =====================================================================
echo.
call npx expo start --clear
goto :menu

:: -----------------------------------------------------------------------
:: 5. EAS Login
:: -----------------------------------------------------------------------
:eas_login
cls
echo =====================================================================
echo                     EXPO / EAS AUTHENTICATION
echo =====================================================================
echo.
call npx eas-cli whoami
echo.
echo If you need to log in to another account or re-authenticate:
call npx eas-cli login
echo.
pause
goto :menu

:exit
echo.
echo Exiting Century Sip Build Utility.
exit /b 0
