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
