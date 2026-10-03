# Check-list de vérification après déploiement

À faire après chaque déploiement sur le serveur Scaleway (voir `deploy/README.md`), dans cet ordre. Prend 3-5 minutes.

## 1. Le déploiement lui-même
- [ ] `ssh root@78.232.5.181 "systemctl status bookipix --no-pager"` → service `active (running)`
- [ ] `curl https://78.232.5.181.sslip.io/api/health` → `{"status":"OK"}`
- [ ] Si le frontend a changé : les trois lignes de contrôle du bundle (voir `deploy/README.md`) → `onrender.com` et `Program Files` à 0, `"/api"` présent

## 2. Le site répond
- [ ] `https://78.232.5.181.sslip.io/api/health` → `{"status":"OK"}`
- [ ] `https://78.232.5.181.sslip.io` s'ouvre sans page blanche ni erreur visible

## 3. Le parcours créateur (compte existant)
- [ ] Connexion (`/login`) fonctionne
- [ ] Le dashboard (`/dashboard`) charge la liste des livres avec les bons compteurs
- [ ] Ouvrir un livre existant (`/book/:id`) fonctionne
- [ ] Créer un nouveau livre (`/create-book`) va jusqu'au bout sans erreur
- [ ] Si le changement touche aux chapitres : générer une amorce, ajouter une contribution, générer un brouillon de chapitre

## 4. Le parcours contributeur (lien d'invitation, sans compte)
- [ ] Un lien `/contribute/:token` existant s'ouvre et accepte une contribution (photo + message)
- [ ] Un lien de partage `/participer/:token` ou un lien individuel `/collectif/:token` fonctionne de la même façon

## 5. Commande (si le changement touche au paiement)
- [ ] Le tunnel de commande (`/book/:id/checkout`) s'ouvre sans erreur jusqu'à l'écran Stripe

## 6. Console du navigateur
- [ ] F12 → onglet Console sur `78.232.5.181.sslip.io` : pas de nouvelle erreur rouge liée au changement fait

## 7. Sécurité (à ne vérifier qu'après un changement touchant l'auth/les accès)
- [ ] Les anciennes routes supprimées répondent bien en erreur (ex. `/api/invites/debug` → 404)
- [ ] Un livre qui n'est pas le vôtre reste inaccessible (403/404) si vous testez avec un ID connu

---
*Fichier créé le 2026-08-29 pendant la refonte Bookipix — mis à jour au fil des étapes. Réécrit le 2026-10-02 pour le serveur Scaleway, Render ayant été décommissionné.*
