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

# Trente secondes, pas dix : sous une charge de 5 sur deux coeurs, une
# reponse peut tarder sans que rien ne soit casse. Un delai trop court
# transforme la veille en fabrique de fausses alertes.
DELAI_SONDE=30
ETAT="/var/lib/celebrons"
COMPTEUR="${ETAT}/veille-echecs"
JOURNAL="${ETAT}/veille.json"

ECHECS_AVANT_ACTION=3

# TRES LONG quand un rendu tourne. Voir plus bas : une fabrication en
# cours monopolise le processeur, et une API qui ne repond pas pendant ce
# temps-la n'est pas une panne — c'est un serveur qui travaille.
ECHECS_AVANT_ACTION_SI_RENDU=30

# Ne jamais enchainer les redemarrages : si l'application retombe aussitot,
# le probleme n'est pas qu'elle a besoin d'un coup de pouce.
DELAI_ENTRE_REDEMARRAGES=600

mkdir -p "${ETAT}"
chmod 755 "${ETAT}"

maintenant=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echecs=$(cat "${COMPTEUR}" 2>/dev/null || echo 0)

if curl -fsS --max-time "${DELAI_SONDE}" "${URL}" >/dev/null 2>&1; then
  # Tout va bien. On efface l'ardoise, sans toucher au journal des
  # incidents : l'historique est justement ce qu'on veut garder.
  echo 0 > "${COMPTEUR}"
  exit 0
fi

echecs=$((echecs + 1))
echo "${echecs}" > "${COMPTEUR}"

# UN RENDU EN COURS N EST PAS UNE PANNE.
#
# Le 2026-09-19, cette veille a tue tous les envois a l imprimeur. Une
# fabrication monopolise le processeur (charge mesuree : 5,26 sur deux
# coeurs) et l'API cesse de repondre a temps. La veille comptait trois
# echecs, redemarrait le service, et systemd tuait le navigateur avec :
# « ca casse au bout de 5 ou 6 pages ».
#
# La presence d'un navigateur de rendu est le signe qu'on travaille. On
# laisse alors trente minutes au lieu de trois : de quoi rattraper un
# rendu VRAIMENT bloque, sans interrompre ceux qui avancent.
navigateurs=$(pgrep -f -- --headless 2>/dev/null | wc -l | tr -d " ")
if [ "${navigateurs:-0}" -gt 0 ]; then
  seuil="${ECHECS_AVANT_ACTION_SI_RENDU}"
  contexte=" (rendu en cours, ${navigateurs} navigateur(s))"
else
  seuil="${ECHECS_AVANT_ACTION}"
  contexte=""
fi

echo "veille : l'API ne repond pas (${echecs}/${seuil})${contexte}" >&2

[ "${echecs}" -lt "${seuil}" ] && exit 0

# Assez attendu. On note d'abord POURQUOI, tant que la machine repond encore.
memoire=$(free -m | awk '/^Mem:/ {print $3"/"$2" Mo"}')
charge=$(cut -d' ' -f1-3 /proc/loadavg)
# pgrep -fc sort le compte ET rend un code d erreur quand il ne trouve
# rien : le repli « || echo 0 » ajoutait alors un SECOND zero, et le JSON
# ecrit plus bas devenait invalide. L application ne pouvait plus le lire,
# donc le bandeau d incident n apparaissait jamais — un garde-fou muet.
# wc -l, lui, ecrit toujours exactement un nombre.
navigateurs=$(pgrep -f -- --headless 2>/dev/null | wc -l | tr -d " ")

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
# Se relire avant de partir : si le JSON est invalide, l application
# l ignorera en silence et le blocage passera inapercu malgre la veille.
if command -v python3 >/dev/null 2>&1; then
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${JOURNAL}" 2>/dev/null || echo "veille : ATTENTION, journal illisible" >&2
fi
chmod 644 "${JOURNAL}"

echo "veille : ${action} (memoire ${memoire}, charge ${charge}, ${navigateurs} navigateur(s))" >&2
echo 0 > "${COMPTEUR}"
