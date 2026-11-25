@echo off
rem Runs the keybr server in the foreground. This window IS the server:
rem close it and the site stops. ASCII only: cmd parses .bat as GBK.
for %%I in ("%~dp0.") do set "REPO=%%~fI"
cd /d "%REPO%"
set NODE_ENV=production
set APP_URL=http://localhost:3000/
set COOKIE_SECURE=false
set COOKIE_DOMAIN=localhost
set DATABASE_CLIENT=sqlite
set DATABASE_FILENAME=%REPO%\data\keybr.sqlite
rem Pin the data dir. Upstream default /var/lib/keybr becomes C:\var\lib\keybr
rem on Windows; switching it later makes previously saved settings look lost.
set DATA_DIR=%REPO%\data
rem Mailgun config is mandatory even for local logins (MailgunConfig reads both
rem at startup). Nothing is actually sent locally, so dummy values are fine.
set MAIL_DOMAIN=localhost
set MAIL_KEY=dummy
title keybr server
node --experimental-sqlite root\index.js
