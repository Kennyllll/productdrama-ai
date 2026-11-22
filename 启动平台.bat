@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 这台电脑还没装 Node.js：打开 https://nodejs.org 下载 LTS 版安装后再双击本文件。& pause & exit /b 1)
node scripts\app.mjs
if errorlevel 1 pause
