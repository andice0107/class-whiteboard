#!/bin/sh
# 每次更新後執行：替 html 的 js/css 加上新版本號，避免瀏覽器用到舊檔
V=$(date +%y%m%d%H%M)
sed -i -E "s/\.(js|css)(\?v=[0-9]+)?\"/.\1?v=$V\"/g" index.html play.html
echo $V > version.txt
