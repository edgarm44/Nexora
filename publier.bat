@echo off
cd /d "%~dp0"
echo Publication de Nexora...
git add .
git commit -m "Mise a jour du site"
git push
echo.
echo Termine. Le site sera a jour dans 1 a 2 minutes : https://edgarm44.github.io/Nexora/
pause
