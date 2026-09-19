# Déployer Célébrons sur un serveur Scaleway

Phase de test, décidée le 2026-09-18 : on installe une **copie** du backend sur
Scaleway pour vérifier que la génération PDF y fonctionne — ce que Render ne
permet pas (512 Mo disponibles pour ~600 Mo nécessaires).

**Rien n'est migré pendant cette phase.** Supabase reste la base et le stockage.
Render reste l'environnement de secours. Le domaine ne bouge pas.

---

## Ce que vous faites (≈ 25 min)

### 1. Créer l'instance

Sur la console Scaleway → **Instances** → Créer une instance :

| réglage | valeur |
|---|---|
| Région | Paris (`fr-par-1`) |
| Type | **DEV1-S** (2 vCPU, 2 Go) |
| Image | **Ubuntu 24.04 LTS** |
| Volume | 20 Go (le minimum suffit) |
| Clé SSH | ajoutez la vôtre |

Notez l'**adresse IP publique**.

### 2. Installer

```bash
scp deploy/install-serveur.sh root@<IP>:/root/
ssh root@<IP> "bash /root/install-serveur.sh"
```

Environ 5 minutes. Le script installe Node 22, les bibliothèques de Chromium,
les polices, le code, les dépendances, le Chromium de Puppeteer et le service
système.

### 3. Copier la configuration

Le fichier `.env` contient vos secrets : il n'est **pas** dans le dépôt et se
copie à la main.

```bash
scp backend/.env root@<IP>:/home/celebrons/bookfete/backend/.env
ssh root@<IP> "chown celebrons: /home/celebrons/bookfete/backend/.env && chmod 600 /home/celebrons/bookfete/backend/.env"
```

Avant de copier, vérifiez dans ce fichier que **`GELATO_LIVE_ORDERS` n'est pas
à `1`** : sur un serveur de test, un envoi créerait une commande réelle,
facturée et imprimée.

`deploy/env.exemple` liste toutes les variables attendues, sans aucune valeur.

### 4. Démarrer et vérifier

```bash
ssh root@<IP> "systemctl start celebrons && systemctl status celebrons --no-pager"
ssh root@<IP> "sudo -u celebrons bash -c 'cd /home/celebrons/bookfete/backend && node scripts/check-serveur.js'"
```

Le second script exécute toute la batterie : machine, navigateur, Supabase,
lecture d'un livre, accès aux photos, polices, écriture jetable, génération de
vrais PDF, qualité du résultat, tenue sur plusieurs rendus, mémoire et
processeur. Il finit par un verdict.

Comptez 5 à 10 minutes.

---

## Redéployer ensuite

```bash
ssh root@<IP> "bash /home/celebrons/bookfete/deploy/deploy.sh"
```

Récupère le code, installe les dépendances, **redémarre le service** et vérifie
que l'API répond. En cas d'échec, il affiche les 30 dernières lignes de journal.

Le redémarrage est la partie critique : Node garde les modules chargés en
mémoire, donc un code corrigé qui n'a pas redémarré continue de servir
l'ancienne version. Le piège s'est refermé deux fois sur nous en local.

---

## Commandes utiles

```bash
systemctl status celebrons          # état du service
systemctl restart celebrons         # redémarrer
journalctl -u celebrons -f          # journaux en direct
journalctl -u celebrons -n 100      # les 100 dernières lignes
curl http://127.0.0.1:5000/api/health
node scripts/check-serveur.js --rendus 3   # batterie complète, 3 rendus
```

---

## Reconstruire le site

Le serveur sert le site ET l'API : le site doit donc appeler **sa propre**
API, jamais celle de Render.

```bash
cd frontend
MSYS_NO_PATHCONV=1 REACT_APP_API_URL=/api npx craco build
tar -czf /tmp/b.tgz build
scp /tmp/b.tgz root@<IP>:/tmp/
ssh root@<IP> "cd /home/celebrons/bookfete/frontend && rm -rf build && tar -xzf /tmp/b.tgz && chown -R celebrons: build"
```

### `MSYS_NO_PATHCONV=1` n’est pas décoratif

Sous Git Bash, toute valeur commençant par une barre est convertie en chemin
Windows. `REACT_APP_API_URL=/api` devient `C:/Program Files/Git/api`, et le
site construit appelle `file:///C:/Program%20Files/Git/api/health`.

Le résultat est un site **entièrement mort mais qui s’affiche** : les pages
s’ouvrent, les boutons ne répondent pas, la console montre « Failed to
fetch », `/admin` répond « Page introuvable ». Vécu le 2026-09-19, sur quatre
déploiements de suite.

Le raccourci sûr, depuis PowerShell :

```powershell
$env:REACT_APP_API_URL = '/api'; npx craco build
```

Le site construit **n'est pas dans git** (`frontend/build/` est ignoré depuis
le 2026-09-19). Il ne peut pas y être : ce serveur a besoin d’un build qui
appelle une API **relative**, Render en reconstruit un autre depuis les
sources. Tant que le dossier était versionné, `git pull` refusait d’écraser
le build local et **le déploiement s’arrêtait après avoir annoncé qu’il
commençait**.

Conséquence pratique : après chaque `deploy.sh`, le site reste celui de la
dernière archive envoyée. Pour changer le site, il faut refaire les cinq
lignes ci-dessus — `deploy.sh` seul ne le touche pas.

`/api` est une adresse **relative** : le fichier construit n'embarque aucun
nom de machine et vaut pour l'IP d'aujourd'hui comme pour le domaine de
demain.

Vérifier après coup, systématiquement :

```bash
F=$(curl -s https://<hôte>/ | grep -o "main\.[a-f0-9]*\.js")
curl -s "https://<hôte>/static/js/$F" > /tmp/bundle.js
grep -c onrender.com /tmp/bundle.js     # doit valoir 0
grep -c "Program Files" /tmp/bundle.js  # doit valoir 0
grep -o '"/api"' /tmp/bundle.js | head -1   # doit AFFICHER "/api"
```

**Les trois lignes, pas seulement la première.** Chercher l’absence de
`onrender.com` ne prouve rien : un site construit avec une variable abîmée
passe ce test sans broncher, tout en étant incapable d’appeler quoi que ce
soit. Il faut vérifier ce que le fichier contient, pas ce qu’il ne contient
pas.

Le contrôle complet, depuis un vrai navigateur neuf :

```bash
cd backend && node scripts/check-parcours.js
```

Il ouvre les pages principales sans cache ni session et compte les erreurs
JavaScript et réseau. Zéro partout, ou ce n’est pas bon.

## Webhook Stripe

Sans lui, un paiement n'est enregistré que si le client revient sur la page
de commande. Le 2026-09-19, un client a payé 94,50 € et est tombé sur une
page blanche : Stripe avait l'argent, la commande est restée « en attente de
paiement ». Le webhook, lui, ne dépend d’aucun navigateur.

Dans le tableau de bord Stripe (**mode test**), Développeurs → Webhooks →
Ajouter un point de terminaison :

| champ | valeur |
|---|---|
| URL | `https://78.232.5.181.sslip.io/api/orders/webhook/stripe` |
| événements | `checkout.session.completed` et `checkout.session.async_payment_succeeded` |

Stripe affiche ensuite un **secret de signature** (`whsec_...`). Il se pose
sur le serveur :

```bash
ssh root@<IP>
printf 'STRIPE_WEBHOOK_SECRET=whsec_xxx\n' >> /home/celebrons/bookfete/backend/.env
systemctl restart celebrons
```

Le `printf` avec `\n` n’est pas un détail : un `.env` sans saut de ligne
final colle la nouvelle variable à la précédente, et les deux sont perdues.
Déjà vu ici le 2026-09-18 avec `TRUST_PROXY`.

Vérifier :

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  https://<hôte>/api/orders/webhook/stripe
```

- `Configuration webhook Stripe incomplète` → le secret n’est pas posé.
- `Signature Stripe manquante` → **c’est la bonne réponse** : la route est
  active et exige une signature.

L’URL contient l’adresse IP : elle devra être changée dans Stripe le jour du
passage au vrai domaine.

## Le disque

Le 2026-09-19 il s’est rempli en une journée, et une fabrication a échoué
sur `no space left on device`. Trois causes, toutes traitées :

| ce qui grossissait | taille | traitement |
|---|---|---|
| cache et profil de Chrome | 1,9 Go | profil **jetable** par rendu (`pdfService`) |
| historique git | 884 Mo | dépôt **raccourci** (voir ci-dessous) |
| PDF de travail | ~40 Mo par livre | ménage quotidien, 7 jours **et** 1,2 Go |

### Le dépôt du serveur est raccourci

Le serveur n’a pas besoin de l’historique : il a besoin du code d’aujourd’hui.
Le dossier `.git` pesait 884 Mo — surtout des `frontend/build` commités
pendant des mois — et en pèse 73 depuis :

```bash
cd /home/celebrons/bookfete
sudo -u celebrons git fetch --depth=1 origin main
sudo -u celebrons git reflog expire --expire=now --all
sudo -u celebrons git gc --prune=now
```

`deploy.sh` continue de fonctionner (`git pull --ff-only` s’accommode d’un
dépôt raccourci) — vérifié après l’opération. En revanche `git log` n’y
montre plus qu’un commit : pour enquêter sur l’historique, il faut le dépôt
local, pas celui du serveur.

### Ménage à la main, en cas d’urgence

```bash
cd /home/celebrons/bookfete/backend
node scripts/nettoyer-fichiers-locaux.js                        # liste seulement
node scripts/nettoyer-fichiers-locaux.js --jours 1 --appliquer  # supprime
node scripts/nettoyer-fichiers-locaux.js --budget 500 --appliquer
```

`--budget` est un plafond en Mo : les plus anciens partent tant que le
dossier le dépasse, quel que soit leur âge. Une rétention par âge seule ne
protège pas d’un disque qui se remplit en une journée — c’est précisément ce
qui s’est produit.

## Ce qui n'est PAS fait à ce stade

- Aucune photo déplacée : le stockage reste Supabase.
- Aucun changement DNS : le domaine ne pointe pas ici.
- Render continue de tourner, intact.
- Aucune supervision externe (Sentry, alerte par courriel) : les erreurs sont
  au journal des événements, encore faut-il aller le regarder.
