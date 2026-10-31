cd "$(dirname "$0")"
source ./env.sh
termux-wake-lock
node --watch bot.js
