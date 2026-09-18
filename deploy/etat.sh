#!/usr/bin/env bash
#
# Etat du serveur en un coup d'oeil.
#
#   ssh root@<ip> "bash /home/celebrons/bookfete/deploy/etat.sh"
#
# Repond aux questions qu'on se pose vraiment quand quelque chose cloche :
# est-ce que ca tourne, est-ce que la machine tient, est-ce qu'un rendu est
# en cours, qu'est-ce qui a rate recemment, et la derniere sauvegarde date de
# quand.
#
# Lecture seule : ce script ne modifie rien.

set -uo pipefail

DOSSIER=/home/celebrons/bookfete
titre() { echo ""; echo "=== $1"; }

echo "======================================================================"
echo " Celebrons — etat du serveur      $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "======================================================================"

titre "Machine"
echo "  en route depuis : $(uptime -p 2>/dev/null || uptime)"
echo "  charge (1/5/15m): $(cut -d' ' -f1-3 /proc/loadavg)   sur $(nproc) coeur(s)"
free -m | awk 'NR==2 {printf "  memoire         : %s Mo utilises sur %s (%s Mo libres)\n", $3, $2, $7}'
df -h / | awk 'NR==2 {printf "  disque          : %s utilises sur %s (%s libre)\n", $3, $2, $4}'

titre "Services"
for s in celebrons caddy; do
  etat=$(systemctl is-active "$s" 2>/dev/null)
  depuis=$(systemctl show "$s" -p ActiveEnterTimestamp --value 2>/dev/null)
  printf "  %-12s %-10s depuis %s\n" "$s" "$etat" "${depuis:-?}"
done

titre "Application"
echo "  version deployee : $(sudo -u celebrons git -C "$DOSSIER" rev-parse --short HEAD 2>/dev/null || echo '?')"
reponse=$(curl -fsS --max-time 10 http://127.0.0.1:5000/api/health 2>/dev/null)
echo "  API              : ${reponse:-INJOIGNABLE}"

titre "Rendu PDF en cours ?"
# Le navigateur headless n'existe QUE pendant un rendu : sa presence est le
# signe le plus fiable qu'une generation tourne.
navigateurs=$(pgrep -f -- "--headless" 2>/dev/null | wc -l | tr -d " ")
if [ "$navigateurs" -gt 0 ]; then
  memoire=$(ps -eo rss,args | grep -- "--headless" | grep -v grep | awk '{s+=$1} END {printf "%d", s/1024}')
  echo "  OUI — $navigateurs processus navigateur, ${memoire:-0} Mo"
else
  echo "  non"
fi
noeud=$(ps -eo rss,args | grep "node server.js" | grep -v grep | awk '{printf "%d", $1/1024}')
echo "  memoire de l'API : ${noeud:-0} Mo"

titre "Erreurs des dernieres 24 h"
erreurs=$(journalctl -u celebrons --since "24 hours ago" --no-pager 2>/dev/null | grep -icE "error|echoue|failed" || true)
echo "  ${erreurs:-0} ligne(s) mentionnant une erreur"
journalctl -u celebrons --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -iE "error|echoue|failed" | tail -5 | sed 's/^/    /' || true

titre "Sauvegardes"
if [ -d /home/celebrons/sauvegardes ]; then
  derniere=$(ls -t /home/celebrons/sauvegardes/*.json.gz 2>/dev/null | head -1)
  if [ -n "$derniere" ]; then
    echo "  derniere : $(basename "$derniere")  ($(du -h "$derniere" | cut -f1))"
    echo "  total    : $(ls /home/celebrons/sauvegardes/*.json.gz 2>/dev/null | wc -l) fichier(s)"
  else
    echo "  AUCUNE pour l'instant (la premiere se fera a 3 h)"
  fi
  systemctl list-timers celebrons-sauvegarde --no-pager 2>/dev/null | sed -n 2p | awk '{print "  prochaine: " $1, $2, $3}'
else
  echo "  dossier de sauvegarde absent"
fi

titre "Certificat HTTPS"
# Caddy le renouvelle seul ; on verifie surtout qu'il n'a pas echoue.
domaine=$(grep -oE "^[a-z0-9.-]+\.[a-z]+" /etc/caddy/Caddyfile 2>/dev/null | head -1)
if [ -n "$domaine" ]; then
  fin=$(echo | openssl s_client -connect "${domaine}:443" -servername "$domaine" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  echo "  $domaine — expire le ${fin:-?}"
else
  echo "  aucun domaine lu dans le Caddyfile"
fi

echo ""
echo "----------------------------------------------------------------------"
echo " Journaux en direct :  journalctl -u celebrons -f"
echo " Sauvegarde          :  journalctl -u celebrons-sauvegarde -n 30"
echo "----------------------------------------------------------------------"
