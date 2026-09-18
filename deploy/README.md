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

## Ce qui n'est PAS fait à ce stade

- Aucune photo déplacée : le stockage reste Supabase.
- Aucun changement DNS : le domaine ne pointe pas ici.
- Aucun HTTPS : le serveur écoute en HTTP sur le port 5000, accessible par son
  IP. Suffisant pour tester, à compléter avant toute mise en production.
- Render continue de tourner, intact.
- Aucune sauvegarde automatique de la base.
