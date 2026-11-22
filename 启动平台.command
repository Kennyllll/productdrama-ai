#!/bin/bash
# 双击这个文件启动 ProductDrama（Mac）。第一次可能要右键 →「打开」。
cd "$(dirname "$0")" || exit 1
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo "这台电脑还没装 Node.js：打开 https://nodejs.org 下载 LTS 版安装，装好后再双击本文件。"
  read -r -p "按回车关闭…"
  exit 1
fi
node scripts/app.mjs
status=$?
[ $status -ne 0 ] && read -r -p "出错了（上面有原因），按回车关闭…"
exit $status
