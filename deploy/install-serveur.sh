#!/usr/bin/env bash
#
# Prepare un serveur Ubuntu neuf pour faire tourner Celebrons.
# A lancer UNE SEULE FOIS, en root, sur une instance fraiche.
#
#   ssh root@<ip-du-serveur>
#   bash install-serveur.sh
#
# Ce script n'installe QUE le serveur : il ne touche ni Supabase, ni Render,
# ni le stockage des photos. Il ne contient aucun secret — le fichier .env
# est copie separement (voir deploy/README.md).
#
# Teste pour : Ubuntu 22.04 / 24.04 sur Scaleway DEV1-S (2 vCPU, 2 Go).

set -euo pipefail

UTILISATEUR="celebrons"
DOSSIER="/home/${UTILISATEUR}/bookfete"
DEPOT="https://github.com/celebrons/bookfete.git"

echo "==> Mise a jour du systeme"
apt-get update -y
apt-get upgrade -y

echo "==> Node.js 22 (le projet tourne sur node >= 18)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

echo "==> Bibliotheques requises par Chromium"
# Chromium ne demarre pas sans elles, et l'erreur renvoyee est obscure
# ("Failed to launch the browser process"). On les installe donc d'emblee.
apt-get install -y \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 \
  libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
  libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils wget unzip \
  || apt-get install -y libasound2 # nom different avant Ubuntu 24.04

echo "==> Polices"
# Le rendu charge Cormorant Garamond, Playfair Display et Inter depuis Google
# Fonts a chaque generation. Ces polices systeme servent de filet : sans
# elles, un echec reseau donnerait un PDF sans aucune police correcte.
apt-get install -y fonts-liberation fonts-dejavu-core

echo "==> Utilisateur applicatif (l'application ne tourne jamais en root)"
id -u "${UTILISATEUR}" >/dev/null 2>&1 || useradd -m -s /bin/bash "${UTILISATEUR}"

echo "==> Recuperation du code"
if [ -d "${DOSSIER}/.git" ]; then
  sudo -u "${UTILISATEUR}" git -C "${DOSSIER}" pull --ff-only
else
  sudo -u "${UTILISATEUR}" git clone "${DEPOT}" "${DOSSIER}"
fi

echo "==> Dependances backend"
cd "${DOSSIER}/backend"
sudo -u "${UTILISATEUR}" npm ci --omit=dev

echo "==> Chromium de Puppeteer"
# .puppeteerrc.cjs le range DANS le projet (backend/.cache/puppeteer) plutot
# que dans ~/.cache : c'est ce qui evite le "Could not find Chrome" au
# demarrage. On l'installe explicitement car `npm ci --omit=dev` ne declenche
# pas toujours le telechargement.
# Un dossier incomplet fait ECHOUER l installation suivante au lieu de la
# refaire : le postinstall du projet tente deja le telechargement pendant
# npm ci, et s il echoue (unzip absent des images Ubuntu minimales, rencontre
# le 2026-09-18) il laisse une coquille vide que puppeteer refuse ensuite
# d ecraser. On repart donc toujours d un dossier propre.
sudo -u "${UTILISATEUR}" rm -rf "${DOSSIER}/backend/.cache/puppeteer"
sudo -u "${UTILISATEUR}" npx puppeteer browsers install chrome

echo "==> Service systeme"
cp "${DOSSIER}/deploy/celebrons.service" /etc/systemd/system/celebrons.service
systemctl daemon-reload
systemctl enable celebrons

cat <<MESSAGE

======================================================================
Installation terminee.

Il manque le fichier de configuration, qui contient vos secrets et n'est
donc PAS dans le depot. Depuis votre machine :

  scp backend/.env root@<ip>:${DOSSIER}/backend/.env
  ssh root@<ip> "chown ${UTILISATEUR}: ${DOSSIER}/backend/.env && chmod 600 ${DOSSIER}/backend/.env"

Puis demarrer et verifier :

  systemctl start celebrons
  systemctl status celebrons
  sudo -u ${UTILISATEUR} bash -c "cd ${DOSSIER}/backend && node scripts/check-serveur.js"

======================================================================
MESSAGE
