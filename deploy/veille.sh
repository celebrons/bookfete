#!/usr/bin/env bash
#
# Veille : l'application repond-elle encore ?
#
# Lance chaque minute par celebrons-veille.timer.
#
# POURQUOI CE SCRIPT EXISTE
#
# Le 2026-09-19, la machine est restee injoignable pendant plus d'une heure.
# Elle repondait au ping (10 ms) mais ni le site, ni SSH : un rendu PDF avait
# pris toute la memoire et tout le processeur. Il a fallu un redemarrage
# depuis la console Scaleway, et surtout PERSONNE N'A ETE PREVENU — c'est
# l'utilisateur qui a fini par s'en apercevoir.
#
# Deux reponses, et il faut les deux :
#   - empecher la panne : celebrons.service borne desormais la memoire et le
#     processeur de l'application (MemoryMax, CPUQuota) ;
#   - la voir quand meme : ce script.
#
# Il tourne HORS du groupe de controle de l'application, avec une priorite
# haute. C'est ce qui lui permet d'obtenir du processeur precisement au
# moment ou l'application n'en a plus — sans le plafond ci-dessus, il serait
# asphyxie lui aussi et ne servirait a rien.
#
# Il ne redemarre pas au premier hoquet : un rendu PDF est long, et une
# requete qui met du temps n'est pas une panne. Il faut ECHECS_AVANT_ACTION
# echecs consecutifs, soit plusieurs minutes de silence complet.

set -uo pipefail

URL="http://127.0.0.1:5000/api/health"
ETAT="/var/lib/celebrons"
COMPTEUR="${ETAT}/veille-echecs"
JOURNAL="${ETAT}/veille.json"

ECHECS_AVANT_ACTION=3
# Ne jamais enchainer les redemarrages : si l'application retombe aussitot,
# le probleme n'est pas qu'elle a besoin d'un coup de pouce.
DELAI_ENTRE_REDEMARRAGES=600

mkdir -p "${ETAT}"
chmod 755 "${ETAT}"

maintenant=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echecs=$(cat "${COMPTEUR}" 2>/dev/null || echo 0)

if curl -fsS --max-time 10 "${URL}" >/dev/null 2>&1; then
  # Tout va bien. On efface l'ardoise, sans toucher au journal des
  # incidents : l'historique est justement ce qu'on veut garder.
  echo 0 > "${COMPTEUR}"
  exit 0
fi

echecs=$((echecs + 1))
echo "${echecs}" > "${COMPTEUR}"
echo "veille : l'API ne repond pas (${echecs}/${ECHECS_AVANT_ACTION})" >&2

[ "${echecs}" -lt "${ECHECS_AVANT_ACTION}" ] && exit 0

# Assez attendu. On note d'abord POURQUOI, tant que la machine repond encore.
memoire=$(free -m | awk '/^Mem:/ {print $3"/"$2" Mo"}')
charge=$(cut -d' ' -f1-3 /proc/loadavg)
navigateurs=$(pgrep -fc -- --headless 2>/dev/null | head -1 || echo 0)

dernier=0
if [ -f "${JOURNAL}" ]; then
  dernier=$(grep -o '"quandEpoch":[0-9]*' "${JOURNAL}" | head -1 | cut -d: -f2 || echo 0)
fi
ecoule=$(( $(date +%s) - ${dernier:-0} ))

if [ "${ecoule}" -lt "${DELAI_ENTRE_REDEMARRAGES}" ]; then
  action="aucune (redemarrage deja tente il y a ${ecoule} s)"
else
  systemctl restart celebrons && action="service redemarre" || action="redemarrage IMPOSSIBLE"
fi

cat > "${JOURNAL}" <<JSON
{
  "quand": "${maintenant}",
  "quandEpoch": $(date +%s),
  "echecsConsecutifs": ${echecs},
  "memoire": "${memoire}",
  "charge": "${charge}",
  "navigateursDeRendu": ${navigateurs:-0},
  "action": "${action}"
}
JSON
chmod 644 "${JOURNAL}"

echo "veille : ${action} (memoire ${memoire}, charge ${charge}, ${navigateurs} navigateur(s))" >&2
echo 0 > "${COMPTEUR}"
