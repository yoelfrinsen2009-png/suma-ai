@echo off
setlocal
cd /d "%~dp0"
set "npm_config_cache=%CD%\.npm-cache"

echo ==============================================
echo   DEPLOY SUMA-AI KE FIREBASE
echo ==============================================
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang atau belum masuk PATH.
  echo Instal Node.js LTS dari https://nodejs.org lalu jalankan file ini kembali.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo File package.json tidak ditemukan.
  echo Jalankan file ini dari folder proyek hasil ekstrak ZIP.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Dependency Vue dan Vite belum tersedia.
  echo Menjalankan npm install otomatis...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Vite tetap tidak ditemukan setelah npm install.
  echo Kirimkan pesan error instalasi yang tampil di atas.
  goto :failed
)

echo Menjalankan pemeriksaan Vue, build, dan deploy Firebase...
call npm.cmd run check
if errorlevel 1 goto :failed

call npx.cmd firebase-tools@latest deploy --only hosting,firestore:rules,firestore:indexes --project sumai-bb116
if errorlevel 1 goto :failed

echo.
echo DEPLOY BERHASIL.
pause
exit /b 0

:failed
echo.
echo DEPLOY GAGAL. Salin atau foto pesan error di atas.
pause
exit /b 1
