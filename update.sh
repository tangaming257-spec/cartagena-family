T="$(cd "$(dirname "$0")" && pwd)"
D=~/storage/downloads
for n in bot setup-server; do
  f=$(ls -t "$D"/$n.js "$D"/$n-[0-9]*.js 2>/dev/null | head -1)
  if [ -n "$f" ]; then
    cp "$f" "$T/$n.js" && echo "OK: $(basename "$f") -> $n.js"
    rm -f "$D"/$n.js "$D"/$n-[0-9]*.js 2>/dev/null
  fi
done
