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
for UNITE in celebrons.service celebrons-sauvegarde.service celebrons-sauvegarde.timer celebrons-veille.service celebrons-veille.timer; do
  SOURCE="${DOSSIER}/deploy/${UNITE}"
  [ -f "${SOURCE}" ] || continue
  if ! cmp -s "${SOURCE}" "/etc/systemd/system/${UNITE}"; then
    cp "${SOURCE}" "/etc/systemd/system/${UNITE}"
    echo "    ${UNITE} mis a jour"
    RECHARGER=1
  fi
done
if [ "${RECHARGER}" = "1" ]; then
  systemctl daemon-reload
  # La veille est nouvelle : l'activer si elle ne l'est pas encore.
  systemctl enable --now celebrons-veille.timer >/dev/null 2>&1 || true
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
