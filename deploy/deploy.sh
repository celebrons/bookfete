#!/usr/bin/env bash
#
# Deploie la derniere version sur le serveur.
#
#   ssh root@<ip> "bash /home/celebrons/bookfete/deploy/deploy.sh"
#
# Ou, depuis le serveur :
#   bash /home/celebrons/bookfete/deploy/deploy.sh
#
# Ce script ne touche jamais au fichier .env : vos secrets restent en place.

set -euo pipefail

UTILISATEUR="celebrons"
DOSSIER="/home/${UTILISATEUR}/bookfete"

# TOUT LE DEPLOIEMENT TIENT DANS UNE FONCTION. Ce n'est pas une coquetterie :
# bash lit un script au fil de l'eau, en retenant sa POSITION dans le
# fichier. Or la premiere chose que fait ce script est de recuperer une
# nouvelle version du depot... y compris de lui-meme. Le fichier change de
# longueur sous les pieds de bash, qui reprend sa lecture au mauvais
# endroit : des commandes sont sautees en silence.
#
# C'est arrive le 2026-09-19 : le bloc qui installe les unites systemd a ete
# purement et simplement ignore, et le plafond de memoire cense proteger la
# machine n'a jamais ete pose. Le deploiement s'annoncait pourtant reussi.
#
# Une fonction est analysee en entier avant d'etre executee : la mise a jour
# du fichier ne peut plus l'amputer.
deployer() {

echo "==> Code"
sudo -u "${UTILISATEUR}" git -C "${DOSSIER}" pull --ff-only

echo "==> Dependances"
cd "${DOSSIER}/backend"
sudo -u "${UTILISATEUR}" npm ci --omit=dev

echo "==> Services systeme"
# Les fichiers d'unite font partie du depot, mais systemd lit ceux de
# /etc/systemd/system. Sans cette recopie, un plafond de memoire ajoute
# dans deploy/celebrons.service ne s'applique JAMAIS : on croit la machine
# protegee alors qu'elle ne l'est pas. C'est ce qui l'a rendue injoignable
# le 2026-09-19.
RECHARGER=0
# Toutes les unites du depot, sans liste a tenir a jour : une unite ajoutee
# et oubliee dans une liste en dur ne serait jamais deployee, et on la
# croirait active. C'est deja arrive avec le plafond de memoire.
for SOURCE in "${DOSSIER}"/deploy/celebrons*.service "${DOSSIER}"/deploy/celebrons*.timer; do
  [ -f "${SOURCE}" ] || continue
  UNITE=$(basename "${SOURCE}")
  if ! cmp -s "${SOURCE}" "/etc/systemd/system/${UNITE}"; then
    cp "${SOURCE}" "/etc/systemd/system/${UNITE}"
    echo "    ${UNITE} mis a jour"
    RECHARGER=1
  fi
done
if [ "${RECHARGER}" = "1" ]; then
  systemctl daemon-reload
  # Activer les minuteries, y compris celles qui viennent d'apparaitre.
  for T in "${DOSSIER}"/deploy/celebrons*.timer; do
    [ -f "${T}" ] || continue
    systemctl enable --now "$(basename "${T}")" >/dev/null 2>&1 || true
  done
  echo "    systemd rechargé"
else
  echo "    inchangés"
fi

echo "==> Redemarrage"
# LE POINT CRITIQUE. Node garde les modules charges en memoire : sans ce
# redemarrage, le serveur continue de servir l'ANCIEN code, corrections
# comprises. Le piege s'est referme deux fois sur nous en local le
# 2026-09-17 (double page corrigee mais toujours inversee, puis fichier
# Gelato toujours a 35 pages) — il ne doit jamais se reproduire ici.
systemctl restart celebrons

sleep 3
systemctl is-active --quiet celebrons && echo "==> Service actif" || {
  echo "==> ECHEC : le service n'a pas demarre"
  journalctl -u celebrons -n 30 --no-pager
  exit 1
}

echo "==> Verification de l'API"
curl -fsS --max-time 15 http://127.0.0.1:5000/api/health && echo "" || {
  echo "==> ECHEC : l'API ne repond pas"
  journalctl -u celebrons -n 30 --no-pager
  exit 1
}

echo ""
echo "Deploiement termine. Version : $(sudo -u "${UTILISATEUR}" git -C "${DOSSIER}" rev-parse --short HEAD)"
}

deployer "$@"
