#!/bin/bash
# openretry-20261019. bash install.sh --check | (install only) | --enable | --disable
set -u
HERE=$(cd "$(dirname "$0")" && pwd); W=/workspace; BK=$W/backups/openretry-20261019
case "${1:-}" in
 --check) python3 -m py_compile "$HERE/openretry.py" && (cd "$HERE" && sha256sum -c --quiet SHA256SUMS) && TOOLS_SRC=$W/tools python3 "$HERE/test_openretry.py" 2>&1 | tail -3; exit ;;
 --disable) rm -f $W/state/openretry.enabled; crontab -l 2>/dev/null | grep -v "openretry.py" | crontab -; echo "disabled (file and cron line removed)"; exit ;;
 --enable)
   [ -f $W/tools/openretry.py ] || { echo "install first"; exit 1; }
   [ -s /home/ubuntu/.config/clerkbox/openretry.hc ] || { echo "STOPPED: no Healthchecks URL in /home/ubuntu/.config/clerkbox/openretry.hc (the alarm would be missing)"; exit 1; }
   touch $W/state/openretry.enabled
   (crontab -l 2>/dev/null | grep -v "openretry.py"; echo "*/30 * * * * /usr/bin/python3 $W/tools/openretry.py >>$W/state/openretry.log 2>&1  # openretry-20261019") | crontab -
   echo "enabled: every 30 min, silent while the portal is closed"; exit ;;
esac
mkdir -p "$BK"; (cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || { echo "files damaged"; exit 1; }
[ -e $W/tools/openretry.py ] && cp -p $W/tools/openretry.py "$BK/openretry.py.prev"
install -m 755 "$HERE/openretry.py" $W/tools/openretry.py && echo "installed (NOT enabled). Next: --enable"
