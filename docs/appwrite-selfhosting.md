# Runbook — Appwrite self-hosted (VPS) — Story 20.1

Provisioning de l'instance Appwrite auto-hébergée qui remplacera Supabase Auth.
Ce document est le **guide d'exécution** ; il ne contient **aucun secret réel** (uniquement des exemples).

> ⚠️ **Sécurité** : `_APP_OPENSSL_KEY_V1`, mot de passe SMTP, Google Client Secret et API key
> vivent **uniquement** dans le gestionnaire de secrets / `.env` non committé. Ne jamais les mettre ici.
> Rappel : le repo a déjà de la dette (secrets versionnés en clair dans `.env` backend et `.xcconfig` iOS).
> **Ne pas reproduire ce pattern** pour Appwrite.

Réf plan : `_bmad-output/planning-artifacts/auth-migration-supabase-to-appwrite.md`
Story : `_bmad-output/implementation-artifacts/20-1-appwrite-infra-provisioning.md`

---

## Matrice des secrets (où vit quoi — jamais la valeur)

| Secret | Généré / obtenu | Stockage | Immuable ? |
|---|---|---|---|
| `_APP_OPENSSL_KEY_V1` | installeur Appwrite (ou `openssl rand -hex 32`) | secrets manager + `.env` VPS | **OUI** (le changer = données sensibles illisibles) |
| SMTP password | fournisseur (SendGrid/Mailgun/SES) | `.env` VPS | non |
| Google Client ID / Secret | Google Cloud Console | Console Appwrite (Secret) + note secrets | non |
| API key backend | Console Appwrite | secrets manager → `.env` backend (story 20.2) | non (régénérable) |
| `PROJECT_ID`, endpoint | Console Appwrite | non secret — reportable dans configs | — |

---

## Task 1 — VPS & DNS (AC1, AC2)

Prérequis VPS : Docker + Docker Compose, **≥ 2–4 Go RAM**.

```bash
# DNS : créer un A/AAAA vers l'IP du VPS
#   appwrite.laneo.<tld>   →  <IP_VPS>
# (idéalement même domaine parent que le front pour éviter les cookies cross-domain)

# Firewall : ouvrir 80 (challenge ACME) et 443
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Task 2 + Task 3 — Déployer Appwrite via l'installeur officiel (AC1, AC3, AC4)

On **n'écrit pas** le compose à la main : on utilise l'installeur officiel, **épinglé à une version précise**
(vérifier la dernière patch stable 1.6.x / 1.7.x sur https://github.com/appwrite/appwrite/releases — ex. `1.6.1`).

```bash
# Depuis un dossier de travail sur le VPS (ex. /opt/laneo)
docker run -it --rm \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw \
  --entrypoint="install" \
  appwrite/appwrite:1.6.1     # ← ÉPINGLER (jamais :latest)
```

L'installeur génère `./appwrite/docker-compose.yml` + `./appwrite/.env` (dont un `_APP_OPENSSL_KEY_V1` aléatoire).

Éditer `./appwrite/.env` — **sous-ensemble auth-critique** (valeurs d'exemple) :

```dotenv
_APP_ENV=production
_APP_LOCALE=en

# Domaine + SSL (Let's Encrypt automatique sur domaine public)
_APP_DOMAIN=appwrite.laneo.example.com
_APP_DOMAIN_TARGET=appwrite.laneo.example.com
_APP_DOMAIN_FUNCTIONS=functions.appwrite.laneo.example.com

# AC3 — force HTTPS (indispensable pour les cookies Secure;SameSite=None)
_APP_OPTIONS_FORCE_HTTPS=enabled

# AC4 — clé de chiffrement : générée par l'installeur. NE JAMAIS LA CHANGER.
#        Si tu la fixes toi-même : openssl rand -hex 32
_APP_OPENSSL_KEY_V1=__NE_PAS_COMMITTER__

# Laisser l'anti-abus actif : il porte le rate-limit login/JWT (15 min, ~10 JWT/h/user)
_APP_OPTIONS_ABUSE=enabled

# Identité expéditeur des emails système
_APP_SYSTEM_EMAIL_NAME=Laneo
_APP_SYSTEM_EMAIL_ADDRESS=noreply@laneo.example.com

# Task 4 — SMTP (voir plus bas)
_APP_SMTP_HOST=
_APP_SMTP_PORT=587
_APP_SMTP_SECURE=tls
_APP_SMTP_USERNAME=
_APP_SMTP_PASSWORD=__NE_PAS_COMMITTER__
```

Démarrer + sauvegarder immédiatement la clé :

```bash
cd appwrite && docker compose up -d
docker compose ps                      # AC1 : tous les conteneurs "healthy"
grep _APP_OPENSSL_KEY_V1 .env          # → copier la valeur dans le secrets manager, puis oublier
```

**Vérifs AC2 / AC3** :
```bash
curl -I http://appwrite.laneo.example.com     # attendu : 301/308 → https
curl -I https://appwrite.laneo.example.com/v1/health   # attendu : 200, cert valide (pas d'erreur TLS)
```

---

## Task 4 — SMTP (AC5)

Sans SMTP, **aucun** email de vérification / reset / OTP ne partira (bloquant pour 20.2+).

1. Renseigner les `_APP_SMTP_*` ci-dessus (SendGrid, Mailgun, SES…), `docker compose up -d` pour recharger.
2. Vérifier SPF/DKIM du domaine expéditeur.
3. **Test réel** : dans la console → créer un utilisateur test avec vérification email, ou déclencher un
   "reset password" → confirmer la **réception effective** (et pas en spam).

---

## Task 5 — Projet & plateformes (AC6, AC7)

Console Appwrite (`https://appwrite.laneo.example.com/console`) :

1. Créer le projet **Laneo** → noter le `PROJECT_ID` (non secret).
2. Add platform :
   - **Web** : hostname prod du front (`app.laneo.<tld>`) **et** `localhost` (dev).
   - **Apple / iOS** : bundle `com.matahe.Laneo`.
   - **Apple / macOS** : bundle `app.laneo.mac`.

---

## Task 6 — Email/Password + Google OAuth (AC8, AC9)

1. **Auth → Settings** : activer **Email/Password**.
2. **Google Cloud Console** → APIs & Services → Credentials → **Create OAuth client ID** (type *Web application*).
3. Dans la modale Google d'Appwrite (Auth → Google), copier la **redirect URI** — format exact :
   ```
   https://appwrite.laneo.example.com/v1/account/sessions/oauth2/callback/google/<PROJECT_ID>
   ```
   La coller dans Google Cloud → **Authorized redirect URIs**. *(Erreur de redirect URI = cause n°1 d'échec OAuth self-hosted.)*
4. Reporter **Client ID / Secret** de Google dans Appwrite → activer.
5. **Test manuel** : lancer un flux Google depuis la console/test → session créée. ✅ AC9

---

## Task 7 — API key backend (AC10)

Console → **Overview → API keys → Create** :
- Scopes **minimaux** : `users.read`, `users.write` (+ `sessions.write` si nécessaire pour 20.3).
- Stocker hors repo. Elle alimentera `APPWRITE_API_KEY` du backend (story 20.2) et le script de migration (20.3).

Le backend (20.2) attendra donc :
```dotenv
APPWRITE_ENDPOINT=https://appwrite.laneo.example.com/v1
APPWRITE_PROJECT_ID=<PROJECT_ID>
APPWRITE_API_KEY=__NE_PAS_COMMITTER__
```

---

## Task 9 — Sauvegardes (AC12)

Volumes Docker à sauvegarder : **MariaDB**, **Redis**, **certificats** (répertoire `appwrite/`).

```bash
# Exemple de dump MariaDB (adapter le nom du conteneur : docker compose ps)
docker compose exec mariadb sh -c \
  'exec mysqldump --all-databases -uroot -p"$MYSQL_ROOT_PASSWORD"' > backup-appwrite-$(date +%F).sql
```

- Planifier (cron) + **tester au moins une restauration** avant de considérer AC12 satisfait.
- Sauvegarder aussi `appwrite/.env` (contient la clé de chiffrement) dans un coffre — sinon backup MariaDB inexploitable.

---

## Checklist de sortie (mapping AC)

- [ ] AC1 `docker compose ps` tous healthy · version épinglée
- [ ] AC2 domaine HTTPS + cert valide
- [ ] AC3 HTTP → HTTPS
- [ ] AC4 `_APP_OPENSSL_KEY_V1` sauvegardée hors repo, documentée immuable
- [ ] AC5 email de test **reçu**
- [ ] AC6 `PROJECT_ID` noté
- [ ] AC7 plateformes web / iOS / macOS déclarées
- [ ] AC8 Email/Password activé
- [ ] AC9 connexion Google aboutie
- [ ] AC10 API key scopes minimaux, hors repo
- [ ] AC11 ce runbook versionné (fait)
- [ ] AC12 backup testé

## Ne fait PAS partie de cette story

- ❌ Aucune modif de code backend/web/iOS (→ 20.2–20.5)
- ❌ Aucun import d'utilisateurs (→ 20.3)
- ❌ Supabase reste en prod, intact (→ décommission en 20.6)
