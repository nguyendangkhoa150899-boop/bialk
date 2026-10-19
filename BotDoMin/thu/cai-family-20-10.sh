#!/bin/bash
# 20/10: CAI LEN VPS - Family (lien ket tai khoan) + bo gioi han tang 100 + muc tay diem am khi o Cong cu.
# Chay tren VPS (root):
#   rm -rf /tmp/bialk-moi && git clone -q --depth 1 https://github.com/nguyendangkhoa150899-boop/bialk.git /tmp/bialk-moi \
#     && bash /tmp/bialk-moi/BotDoMin/thu/cai-family-20-10.sh
# Lam dung quy trinh deploy bot (CLAUDE.md tlbbnetco4): so md5 file dang chay voi ban goc (bo \r) -> lech la DUNG, khong chep gi;
# sao luu ban cu vao /opt/tlbb-backup; tr -d '\r' + node --check; chi restart minigame khi game KHONG dang restart.
set -u
SRC=/tmp/bialk-moi/BotDoMin
DST=${DST:-/opt/minigame/BotDoMin}   # DST / BK / KHONG_RESTART=1 de chay thu
BK=${BK:-/opt/tlbb-backup/bot-truoc-family-20-10}
FILES="fam.client.js family.js ghepngoc.js ichky.client.js index.js panel.js petboss.js thuongpho.client.js thuongpho.js tuiboss.client.js webplay.js"
# md5 (bo \r) cua ban dang chay tren VPS = commit ce42220 (panel.js co the da la 9de8f17 neu da cai muc tay diem am khi). MOI = file moi.
declare -A GOC=(
  [fam.client.js]=MOI [family.js]=MOI
  [ghepngoc.js]=d8cb04baae712abc42c78d24e075e040
  [ichky.client.js]=f59490fe0a242b74a9518a7581876a5c
  [index.js]=db8a234c8525857bbcd6b7f36e502ad5
  [panel.js]="b845e76fe5c8536a21dd9c2b9c91b67c 65f6ba1a35d46a363a0709d89122a526"
  [petboss.js]=3c109145bc95663f64fd886dc2cbdc4b
  [thuongpho.client.js]=062e8ded528a741bffb7961e9ea1f049
  [thuongpho.js]=977cbec2682668f4872065ebe24155c0
  [tuiboss.client.js]=28103d2c5904b79b4a4c61deecac6ddd
  [webplay.js]=2879e74ae396155d7b82a4f6f292f77c
)
[ -d "$SRC" ] || { echo "Khong thay $SRC - chay lenh git clone truoc"; exit 1; }
echo "== 1. So md5 file dang chay tren VPS"
LECH=0
for f in $FILES; do
  if [ "${GOC[$f]}" = MOI ]; then
    [ -e "$DST/$f" ] && { echo "  !! $f: file MOI ma VPS da co san - kiem tay"; LECH=1; } || echo "  ok $f (file moi)"
    continue
  fi
  m=$(tr -d '\r' < "$DST/$f" 2>/dev/null | md5sum | cut -c1-32)
  if [[ " ${GOC[$f]} " == *" $m "* ]]; then echo "  ok $f"; else echo "  !! $f: md5 $m KHAC ban goc - co nguoi sua thang tren VPS"; LECH=1; fi
done
[ $LECH = 0 ] || { echo "DUNG: co file lech - KHONG chep gi. Gui ket qua nay cho Claude."; exit 1; }
echo "== 2. Kiem cu phap ban moi"
mkdir -p /tmp/bialk-moi-lf
for f in $FILES; do tr -d '\r' < "$SRC/$f" > "/tmp/bialk-moi-lf/$f" || exit 1; done
for f in $FILES; do
  case $f in *.js) cp "/tmp/bialk-moi-lf/$f" /tmp/kiem-cu-phap.js && node --check /tmp/kiem-cu-phap.js || { echo "DUNG: $f loi cu phap"; exit 1; };; esac
done
echo "  ok ca $(echo $FILES | wc -w) file"
echo "== 3. Sao luu ban cu -> $BK"
mkdir -p "$BK"
for f in $FILES; do [ -e "$DST/$f" ] && cp -p "$DST/$f" "$BK/$f"; done
echo "== 4. Chep ban moi"
for f in $FILES; do cp "/tmp/bialk-moi-lf/$f" "$DST/$f"; done
echo "== 5. Restart bot (chi khi game khong dang restart)"
if [ "${KHONG_RESTART:-}" = 1 ]; then echo "  (chay thu: bo qua restart)"
elif [ "$(systemctl list-jobs | grep -c tlbb)" != 0 ]; then
  echo "  Game DANG restart - chua restart bot. Doi game len xong roi chay: systemctl restart minigame"
else
  systemctl restart minigame; sleep 8; echo "  minigame: $(systemctl is-active minigame)"
fi
echo "XONG. Hoan tac neu loi: cp $BK/* $DST/ && rm -f $DST/fam.client.js $DST/family.js && systemctl restart minigame"
rm -rf /tmp/bialk-moi-lf /tmp/kiem-cu-phap.js
