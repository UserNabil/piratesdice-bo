# JOURNAL — backoffice The Pirate's Dice

Append-only (R1). On n'efface jamais une conclusion fausse : on écrit la
correction **en dessous**, datée.

Statuts (R2) : **VÉRIFIÉ** / **FAIT MAIS NON VÉRIFIÉ** / **OUVERT**.
Aucun statut sans log. Un outil est **EXÉCUTÉ AVEC SUCCÈS** (log joint) ou
**NON EXÉCUTÉ** (R3).

---

## 2026-09-10 14:04 — Ouverture du dépôt

Dépôt distant `github.com/UserNabil/piratesdice-bo` **existant et vide**.

```
$ git ls-remote https://github.com/UserNabil/piratesdice-bo
exit=0
(aucune référence)
```

`git init -b main` local, `origin` posé. **VÉRIFIÉ.**

Le backoffice vit dans son propre dépôt, séparé de `piratesdice` (le jeu) et de
`dice-server` (le serveur). Aucun fichier du jeu n'est modifié.

---

## 2026-09-10 14:05 — Étape 1, reconnaissance

Publiée dans `RECONNAISSANCE.md`. Chaque affirmation y porte **[MESURÉ]**,
**[SECOND]** ou **[NON MESURÉ]** (R4 : un grep n'est pas une mesure ; un rapport
d'audit non plus).

### Outils EXÉCUTÉS AVEC SUCCÈS

| commande | résultat |
|---|---|
| `curl https://dice.my-officeapps.com/version` | 200, sha `4d52b67`, uptime 14045 |
| `curl https://dice.my-officeapps.com/health` | 200, `database:"up"`, `clients:24` |
| `curl http://192.168.1.19:8100/version` | 200, **même sha, même uptime** |
| `nslookup dice.my-officeapps.com` | Cloudflare : 104.21.56.185 / 172.67.155.73 |
| `/dev/tcp/192.168.1.19/5432` | **ouvert** |
| `/dev/tcp/192.168.1.19/8100` | **ouvert** |
| `netstat -ano -p tcp` | 40 ports en écoute recensés |
| `ipconfig` | cette machine = `192.168.1.140` |
| `node --version` / `python --version` | v22.14.0 / 3.10.8 |
| `python play_api.py --help` | 14 options recensées |

### Outils NON EXÉCUTÉS, et pourquoi

| commande | échec |
|---|---|
| `ssh -o BatchMode=yes vm-local` | `Permission denied (publickey,password)` — mot de passe requis |
| `python asc.py get /v1/apps?...` | `ModuleNotFoundError: No module named 'jwt'` **et** `~/.appstoreconnect/` absent |
| `python play_api.py --check` | `cle absente : ni signing/play-service-account.json, ni PLAY_SERVICE_ACCOUNT_JSON` |
| `psql` (schéma réel) | binaire absent du PATH **et** aucun identifiant de lecture |

### Ce qui est établi — **VÉRIFIÉ**

1. **La production est `192.168.1.19`**, pas une machine distincte derrière
   Cloudflare. Preuve : même SHA **et même compteur d'uptime** vus au même instant
   par les deux chemins. Un SHA identique seul n'aurait rien prouvé (deux
   instances du même code) ; l'uptime tranche.
2. **PostgreSQL de production est joignable depuis cette machine** (5432 ouvert
   sur `.19`). Le backoffice n'a pas besoin de tunnel.
3. **`127.0.0.1:8787` est libre** — retenu pour l'écoute du backoffice.
4. **Les deux API de boutique sont hors d'atteinte depuis cette machine.** Les
   secrets sont sur le Mac. L'écran ④ dira « non lu ».

### Ce qui est **OUVERT**

- **B1 — le schéma réel.** `\d match` non lu. L'écran ③ en dépend entièrement.
- **B2 — journald.** Pas d'accès SSH.
- **B3 / B4 — les clés de boutique.** Absentes de cette machine.
- **B5 — le compte exact des routes HTTP.** 11 chaînes confirmées côté client, 13
  annoncées. L'écart n'est pas expliqué.

### Une correction, tout de suite

⛔ `RAPPORT_NUIT.md:1373` affirme « **cette machine n'a pas de PostgreSQL**
(`which psql` → rien) ».

**C'est faux appliqué à cette machine-ci.** `postgres.exe` (PID 7668) écoute sur
`0.0.0.0:5432` **[MESURÉ]**. La phrase visait le Mac de développement, pas le
poste Windows. Elle est vraie sur `which psql` — le **client** est bien absent —
et fausse sur « pas de PostgreSQL » : le **serveur** tourne. C'est exactement le
piège de R4 : `which psql` mesure le client, pas le service.

Conséquence pratique : **le port 5432 local est pris**, et un futur PostgreSQL de
travail pour le backoffice devra en choisir un autre.

### Un écart avec l'énoncé, signalé et non tranché

La demande cite la table **`captain_progress`**. Les migrations auditées disent
**`campaign_progress`** (`029_campagne.sql`) — étoiles de campagne par niveau. Le
capitaine, lui, est une **colonne** `player.captain`. **OUVERT** jusqu'à lecture
du schéma réel : je n'invente pas la table qui manque.

---

## 2026-09-10 14:11 — État

Étape 1 : **VÉRIFIÉ** (dans les limites dites ci-dessus).
Étape 2 (architecture) : en cours de rédaction, **rien de construit**.
Aucune écriture en base. Aucun appel à une API de boutique. Aucun déploiement.
Aucune tâche de fond en cours (R9).

---

## 2026-09-10 14:18 — Étape 2, architecture proposée

`ARCHITECTURE.md` publié. **Rien de construit.** En attente de validation.

Résumé des choix et de leur raison :

- **Node 22 + `pg`, une seule dépendance, aucune étape de build.** Node est déjà
  là, le serveur de jeu est en Node (un seul langage pour les deux moitiés),
  `node --test` est livré avec. Pas de framework front : la valeur est dans le
  SQL, pas dans une interface.
- **Lecture seule : quatre gardes superposées** (G1 rôle `SELECT` seul, G2
  `default_transaction_read_only`, G3 session en lecture seule, G4 point de
  passage unique refusant tout ce qui ne commence pas par SELECT/WITH). Dit
  explicitement dans le document : **seule G1 compte vraiment**, et elle vit hors
  du backoffice. Un test devra tenter un INSERT et exiger son échec.
- **`/version` + tampon affiché en bas de chaque écran**, SHA lu par
  `git rev-parse` au démarrage, suffixe `+sale` si larbre

⛔ **L'ENTRÉE CI-DESSUS EST TRONQUÉE. Elle s'arrête au milieu d'une phrase.**

Je l'ai écrite avec un `printf` dans un shell : les accents graves de
`` `asc.py` `` ont été interprétés comme substitution de commande (`bash: asc.py:
command not found`) et l'apostrophe de « l'arbre » a fermé la chaîne. Le reste de
l'entrée n'a jamais atteint le fichier — et le commit `bcc5ba5` a **quand même
réussi**, puisque `git commit` ne relit pas ce qu'il enregistre.

Je ne l'efface pas (R1). Elle reste comme trace : **un outil qui rend la main en
succès n'a pas prouvé qu'il a écrit ce que je croyais.** C'est le même piège que
`--si-libre` sortant en succès quand il sautait, et que les 293 tests verts sur
trois effets cassés. Le journal a servi à quelque chose exactement une fois : ici.

Correctif de méthode, appliqué à partir de maintenant : **le journal s'écrit avec
l'outil d'écriture de fichier, jamais par `printf`/heredoc dans un shell**, et je
relis la fin du fichier après écriture.

Entrée complète, réécrite ci-dessous.

---

## 2026-09-10 14:20 — Étape 2, architecture proposée (entrée complète)

`ARCHITECTURE.md` publié. **Rien de construit.** En attente de validation.

Résumé des choix et de leur raison :

- **Node 22 + `pg`, une seule dépendance, aucune étape de build.** Node est déjà
  là, le serveur de jeu est en Node (un seul langage pour les deux moitiés),
  `node --test` est livré avec. Pas de framework front : la valeur est dans le
  SQL, pas dans une interface.
- **Lecture seule : quatre gardes superposées** — G1 rôle `SELECT` seul, G2
  `default_transaction_read_only`, G3 session en lecture seule, G4 point de
  passage unique refusant tout texte SQL ne commençant pas par SELECT/WITH. Dit
  explicitement dans le document : **seule G1 compte vraiment**, et elle vit hors
  du backoffice. Un test devra tenter un INSERT et exiger son échec.
- **`/version` + tampon affiché en bas de chaque écran**, SHA lu par
  `git rev-parse` au démarrage, suffixe `+sale` si l'arbre est sale. Une version
  qui ne correspond à aucun commit doit se dénoncer elle-même.
- **Boutiques : `asc.py` et `play_api.py` appelés en sous-processus**, jamais
  réécrits, et seules leurs options de lecture sont en liste blanche. L'état
  `non-lu` est un état affiché avec sa raison exacte — aucun chemin de code ne
  produit de valeur par défaut.
- **`actions/` n'existe pas** : le dossier n'est pas créé, le serveur HTTP ne
  monte que des GET et rend 405 sur POST. Aucun point d'extension construit à
  l'avance — une couche bâtie pour un besoin futur est une couche à maintenir
  aujourd'hui pour un besoin qui n'existe pas encore.
- **`listen(8787, '127.0.0.1')` en dur**, pas configurable. Une variable
  d'environnement qui peut valoir `0.0.0.0` est une exposition qui attend une
  faute de frappe.

**OUVERT** — l'écran ③ ne peut pas être conçu avant B1 (`\d match`). Je connais
l'existence de la colonne de raison (`reason: reason || 'normal'` dans
`match.js`), pas son nom ni les autres colonnes.

**Noté pour la mesure à venir** : `disconnect` n'est pas forcément un défaut — un
mobile qui passe sous un tunnel en produit un. La seule forme qui distingue un
défaut mis en production d'un comportement normal d'application mobile, c'est
**une rupture dans le temps**. C'est ce que l'écran ③ doit montrer en premier ;
les autres découpages servent à localiser la cause une fois la rupture vue.