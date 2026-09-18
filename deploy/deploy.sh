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
