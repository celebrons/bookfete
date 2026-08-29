# Check-list de vérification après déploiement

À faire après chaque `.\git-render-deploy.ps1`, dans cet ordre. Prend 3-5 minutes.

## 1. Le déploiement lui-même
- [ ] Le script affiche "Push vers GitHub... OK" (pas "RIEN A COMMITTER" alors que vous attendiez un vrai changement)
- [ ] "Backend: EN LIGNE (200)" et "Frontend: EN LIGNE (200)" à la fin du script
- [ ] Sur [dashboard.render.com](https://dashboard.render.com), les deux services affichent "Live" (pas "Build failed" ni "Deploy failed") — si erreur, ouvrir les logs du service concerné

## 2. Le site répond
- [ ] `https://bookfete.onrender.com/api/health` → `{"status":"OK"}`
- [ ] `https://bookfete-front.onrender.com` s'ouvre sans page blanche ni erreur visible

## 3. Le parcours créateur (compte existant)
- [ ] Connexion (`/login`) fonctionne
- [ ] Le dashboard (`/dashboard`) charge la liste des livres avec les bons compteurs
- [ ] Ouvrir un livre existant (`/book/:id`) fonctionne
- [ ] Créer un nouveau livre (`/create-book`) va jusqu'au bout sans erreur
- [ ] Si le changement touche aux chapitres : générer une amorce, ajouter une contribution, générer un brouillon de chapitre

## 4. Le parcours contributeur (lien d'invitation, sans compte)
- [ ] Un lien `/contribute/:token` existant s'ouvre et accepte une contribution (photo + message)

## 5. Commande (si le changement touche au paiement)
- [ ] Le tunnel de commande (`/book/:id/checkout`) s'ouvre sans erreur jusqu'à l'écran Stripe

## 6. Console du navigateur
- [ ] F12 → onglet Console sur `bookfete-front.onrender.com` : pas de nouvelle erreur rouge liée au changement fait

## 7. Sécurité (à ne vérifier qu'après un changement touchant l'auth/les accès)
- [ ] Les anciennes routes supprimées répondent bien en erreur (ex. `/api/invites/debug` → 404)
- [ ] Un livre qui n'est pas le vôtre reste inaccessible (403/404) si vous testez avec un ID connu

---
*Fichier créé le 2026-08-29 pendant la refonte Celebrons — mis à jour au fil des étapes.*
