# Reconnaissance — backoffice The Pirate's Dice

État : **étape 1 terminée**, publiée avant toute ligne de code.
Session du 2026-09-10.

Toute affirmation porte sa mention de preuve :
**[MESURÉ]** = commande exécutée dans cette session, sortie vue ;
**[SECOND]** = lu dans un document du dépôt du jeu (audit, rapport de nuit), non revérifié ici ;
**[NON MESURÉ]** = je n'ai pas pu, et je dis pourquoi.

---

## 0. La machine sur laquelle tournera le backoffice

| | |
|---|---|
| hôte | `Server`, Windows 11 Pro 10.0.26200 **[MESURÉ]** |
| adresses | `192.168.1.140` (LAN), `192.168.56.1` (VirtualBox), `172.24.192.1` (WSL) **[MESURÉ]** |
| Node | v22.14.0 — npm 10.9.2 **[MESURÉ]** |
| Python | 3.10.8, invoqué `python` et non `python3` **[MESURÉ]** |
| `psql` | **absent du PATH** **[MESURÉ]** |

⚠️ **Cette machine n'est PAS le serveur de jeu.** Le jeu tourne sur `192.168.1.19`.

Le rapport de nuit affirmait « cette machine n'a pas de PostgreSQL ». **C'est faux
sur cette machine-ci** : `postgres.exe` (PID 7668) écoute sur `0.0.0.0:5432`
**[MESURÉ]**. C'est un PostgreSQL local sans rapport connu avec le jeu ; je ne
l'ai pas interrogé. La phrase du rapport visait le Mac de développement.

### Ports déjà occupés — ce que le backoffice doit éviter

Sur toutes interfaces **[MESURÉ]** : 7, 9, 13, 17, 19, 80, 135, 224, 443, 445,
**1433** (SQL Server), 1801, 2103, 2105, 2107, 2179, **3389** (RDP), **5000**,
5040, 5357, **5432** (PostgreSQL local), **6543-6546**, **6551**, 49664-49687.

Sur `127.0.0.1` seulement **[MESURÉ]** : 1976, 14330, 14331, 20241, 20242, 27236.

➡️ **`127.0.0.1:8787` est libre.** Retenu comme port par défaut.

---

## 1. Le serveur de jeu — ce qu'il expose, mesuré en direct

### La production, c'est bien `192.168.1.19`

`dice.my-officeapps.com` résout vers Cloudflare (`104.21.56.185`, `172.67.155.73`)
**[MESURÉ]**. Le tunnel aboutit sur la machine LAN — **prouvé** en comparant les
deux réponses au même instant :

| | `https://dice.my-officeapps.com/version` | `http://192.168.1.19:8100/version` |
|---|---|---|
| sha | `4d52b676d64391891adde2788013fa0a3f173903` | identique |
| démarré | 14163 s | **identique** |

Même SHA et **même compteur d'uptime** : c'est le même processus, pas deux
instances qui se ressemblent. **[MESURÉ]**

### `/version` — le modèle à copier

```json
{"sha":"4d52b676d64391891adde2788013fa0a3f173903","court":"4d52b67",
 "branche":"main","date":"2026-09-10T09:43:03+02:00","source":"deploiement",
 "service":"eden-dice","paquet":"1.0.0","demarre":14045}
```
**[MESURÉ]** — c'est cette forme que le backoffice reprendra (étape 2).

### `/health` — et son mensonge, confirmé

```json
{"status":"ok","service":"eden-dice","version":"1.0.0","uptime":14045,
 "database":"up","matches":0,"queue":0,"clients":24}
```
**[MESURÉ]** — 24 clients connectés à l'instant de la mesure.

⚠️ `status` vaut `ok` indépendamment de l'état de la base. **Le seul champ qui dit
la vérité est `database`.** L'écran ① lira `database`, jamais `status`.

Je n'ai **pas** provoqué de panne de base pour voir le mensonge de mes yeux : ce
serait agir sur la production. Ce point précis reste donc **[SECOND]**. L'écran
affichera `status` et `database` **côte à côte**, pour que la divergence se voie
le jour où elle arrive.

### Les routes HTTP

Recensées dans l'audit de `srv/src/http.js` **[SECOND]** : santé, `device`,
`google`, `apple`, `leaderboard`, `shop`, `ai`, `me`, `inventory`, `history`,
`purchase`.

Confirmées par les chaînes réellement appelées côté client **[MESURÉ]** :
`/api/device`, `/api/apple`, `/api/google`, `/api/me`, `/api/shop`,
`/api/purchase`, `/api/leaderboard`, `/api/dice/session`, `/api/dice/status`,
`/health`, `/version`.

⚠️ Je n'ai **pas** énuméré les 13 routes contre le serveur : il aurait fallu
sonder des chemins un par un en production. Le compte exact est **[NON MESURÉ]** ;
il se lira d'un coup dans `src/http.js` dès accès au dépôt du serveur.

Le temps réel passe par **WebSocket** (`gateway.js`), pas par REST : les parties,
la file d'attente et les abandons vivent là. **[SECOND]**

---

## 2. La base de production

| | |
|---|---|
| hôte | `192.168.1.19:5432` — **port joignable depuis cette machine** **[MESURÉ]** |
| base | `dice` **[SECOND]** |
| tables | **19** **[SECOND]** (contrôle de sauvegarde du 10/09) |
| pool applicatif | `max: 8`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 8000` **[SECOND]** |

### Volumétrie relevée le 10/09 **[SECOND]**

| table | lignes |
|---|---|
| `player` | 1 417 |
| `match` | 2 888 |
| `inventory` | 478 |
| `achievement` | 200 |
| `player_achievement` | 815 |

### Tables recensées — et un écart avec ta liste

Depuis les 31 migrations auditées **[SECOND]** : `player`, `player_alias`,
`match`, `product`, `product_category`, `inventory`, `achievement`,
`player_achievement`, `player_tally`, `offline_ticket`, `campaign_level`,
`campaign_progress`, plus 3 tables d'apprentissage IA (`002_learning.sql`).

⚠️ **Tu cites `captain_progress` ; les migrations disent `campaign_progress`**
(`029_campagne.sql`). Ce n'est pas le même objet : `campaign_progress` porte les
**étoiles de campagne** par niveau. Le capitaine, lui, est une **colonne**
`player.captain` (`003_captains.sql`, défaut `'read'` depuis `026`). À trancher
contre la base réelle avant d'écrire l'écran ②.

### Colonnes connues **[SECOND]**

- `player` : `id`, `rating`, `games`, `basic_coins`, `captain`, `display_name`, parures, motifs
- `match` : ligne écrite par `settleMatch`, **portant une raison de fin** —
  `match.js` fait `reason: reason || 'normal'`, donc `normal` est la valeur par
  défaut, et `quit` / `disconnect` sont les deux autres.
- `achievement` : `identify`, `tally`, `cible`, `reward`, `reward_gold`, `reward_item`, `enabled`
- `player_tally` : compteurs clé/valeur à vie
- `offline_ticket` : `id`, `player_id`, `seed`, `used_at`, `rang`
- `campaign_progress` : `player_id`, `level_id`, `etoiles` (masque de bits)

⚠️ **Le détail colonne par colonne de `match` est [NON MESURÉ]**, et c'est
exactement ce dont dépend l'écran ③. Aucun découpage — par mode, par moment de
l'abandon, par capitaine, par écart de score — ne peut être conçu sérieusement
avant d'avoir lu `\d match`. **C'est le premier SELECT que je passerai.**

### R6 — l'utilisateur en lecture seule

Le service se connecte avec un rôle **propriétaire** créé par `deploy.py`
(`ensure_database`, mot de passe `token_urlsafe(24)` déposé dans le `.env`
distant) **[SECOND]**. Ce rôle ne doit **jamais** servir au backoffice.

SQL à passer **une fois** sur `192.168.1.19` en tant que `postgres`. Je ne l'ai
pas exécuté : c'est une écriture sur la production, elle t'appartient.

```sql
CREATE ROLE bo_lecture LOGIN PASSWORD '<mot de passe long, hors git>';

REVOKE ALL ON DATABASE dice FROM bo_lecture;
GRANT CONNECT ON DATABASE dice TO bo_lecture;

\c dice
REVOKE ALL ON SCHEMA public FROM bo_lecture;
GRANT USAGE ON SCHEMA public TO bo_lecture;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bo_lecture;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bo_lecture;

-- La ceinture en plus des bretelles : même un GRANT futur accordé par erreur
-- ne rendra pas ce rôle écrivain, la transaction elle-même refusera d'écrire.
ALTER ROLE bo_lecture SET default_transaction_read_only = on;
```

⚠️ Deux points qui comptent, et qui se paient plus tard si on les saute :

1. `ALTER DEFAULT PRIVILEGES` ne vaut que pour les tables créées **par le rôle qui
   passe la commande**. Une migration future créant une table sous le rôle du
   service la rendrait **invisible** au backoffice. Il faut soit passer cette
   commande en tant que ce rôle-là, soit rejouer `GRANT SELECT ON ALL TABLES`
   après chaque migration. À décider.
2. `default_transaction_read_only` est ce qui rend R6 **technique** et non
   disciplinaire. Le backoffice posera **en plus** ses transactions en lecture
   seule à la connexion, et **un test tentera un INSERT en exigeant qu'il
   échoue** — sans quoi la garde ne prouve rien.

Il faudra aussi que `pg_hba.conf` accepte `192.168.1.140` pour ce rôle.
**[NON MESURÉ]**

---

## 3. Les journaux

Service systemd **`eden-dice`** sur `192.168.1.19`, journaux dans **journald**
**[SECOND]**.

Lecture : `journalctl -u eden-dice -n 200 --no-pager`, `-f` pour suivre,
`--since` pour borner. `deploy.py --logs N` sait déjà les rapatrier. **[SECOND]**

Rétention posée le 10/09 : `SystemMaxUse=400M`, `MaxRetentionSec=30day`,
**portées par le dépôt du serveur** — posées à la main, elles se perdaient au
premier réinstall. Volume passé de 936 Mo à 304 Mo. **[SECOND]**

---

## 4. Les boutiques — et le mur rencontré

### `asc.py` (Apple)

Sait faire : n'importe quel appel REST à App Store Connect (`get`/`post` +
chemin), en signant un JWT ES256 de 20 minutes. Trouve seul le *key id* dans le
nom du fichier `AuthKey_XXXX.p8` et l'*issuer* dans
`~/.appstoreconnect/issuer_id.txt`. **[MESURÉ]** — fichier lu en entier.

⛔ **INEXÉCUTABLE depuis cette session, deux causes cumulées [MESURÉ] :**

1. `ModuleNotFoundError: No module named 'jwt'` — PyJWT n'est pas installé ici ;
2. **`~/.appstoreconnect/` n'existe pas sur cette machine.** Ni clé, ni issuer.

### `play_api.py` (Google)

Sait faire **[MESURÉ]**, `--help` exécuté : `--check`, `--brut`, `--historique`,
`--listing`, `--details`, `--notes`, `--next-version`, `--upload`, `--promote`,
`--sortie`, `--purger`, `--forcer`, `--si-libre`, `--track`.

Lecture seule utile au backoffice : `--check`, `--brut`, `--historique`, `--details`.
⚠️ `--listing`, `--upload`, `--promote`, `--sortie` **écrivent** chez Google : le
backoffice ne les appellera pas.

⛔ **INEXÉCUTABLE depuis cette session [MESURÉ] :**

```
$ python play_api.py --check
cle absente : ni C:\Users\BureauDistant\piratesdice\signing\play-service-account.json,
ni PLAY_SERVICE_ACCOUNT_JSON
```

### Conséquence directe sur l'écran ④

**Les identifiants des deux boutiques vivent sur le Mac (`/Users/develop/`), pas
ici.** L'écran ④ affichera donc « **non lu** » — jamais une valeur inventée —
tant que tu n'auras pas décidé de poser les clés sur cette machine. Ce sont des
secrets de publication : la décision t'appartient.

### Ce qui est déjà connu de l'état des boutiques **[SECOND]**, mesuré le 10/09

| | en production | dernier paquet reçu |
|---|---|---|
| Apple App Store | **1.1 (build 54) — READY_FOR_SALE** | build 54, 06/09 |
| Google Play | **VIDE** en production ; alpha 74, internal 77 | versionCode 77, 04/09 |

Play est vide **par décision de Google**, pas par défaut de la chaîne : l'accès
production est suspendu à la validation d'un test fermé, demandée lundi 00h01.

⚠️ **Le champ mots-clés Apple — ta première demande — n'a été lu par personne, et
je n'ai pas pu le lire non plus.** Il se lit en un appel dès que la clé est là :
`asc.py get "/v1/appStoreVersions/<id>/appStoreVersionLocalizations"`, champ
`keywords`, 100 caractères, une entrée par langue.

---

## 5. Accès à la machine de production — bloqué

```
$ ssh -o BatchMode=yes vm-local 'hostname'
root@192.168.1.19: Permission denied (publickey,password).
```
**[MESURÉ]** — `~/.ssh/config` définit `vm-local` → `192.168.1.19`, `User root`,
mais aucune clé n'est acceptée : la machine réclame un **mot de passe**.

⚠️ L'audit de `deploy.py` expose en clair `LAN_USER/LAN_PASS = root/admin`
(finding « secret en clair », versionné dans git). **Je ne m'en suis pas servi.**
Ouvrir une session **root** sur la production pour faire de la lecture est
exactement ce que R6 cherche à rendre impossible, et cela ne se décide pas sans
toi. `plink.exe` est disponible ici si tu choisis cette voie. **[MESURÉ]**

---

## 6. Ce qui bloque, et ce qui n'attend que toi

| # | bloqué | ce qu'il me faut | ce que ça débloque |
|---|---|---|---|
| B1 | schéma réel, `\d match` surtout | le rôle `bo_lecture` créé, et son mot de passe | **l'écran ③ en entier**, et les colonnes de ① et ② |
| B2 | journaux journald | accès SSH : clé publique posée, ou ta décision sur le mot de passe | « dernières erreurs » de l'écran ① |
| B3 | mots-clés Apple et fiches | `~/.appstoreconnect/` (`.p8` + issuer) et `pip install pyjwt` | **l'écran ④ côté Apple** |
| B4 | fiches Google Play | `signing/play-service-account.json` | l'écran ④ côté Google |
| B5 | compte exact des routes | accès au dépôt `dice-server` | rien de critique, confort |

**Rien de cela ne bloque l'étape 2 (l'architecture) ni l'étape 4 (les tests)** :
les fonctions de calcul se testent sur données fabriquées, sans base — c'est
précisément ce que l'étape 4 demande.
