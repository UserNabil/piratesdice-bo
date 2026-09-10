# pd-bo — le backoffice de The Pirate's Dice

Console d'administration **en lecture seule**, sur **`127.0.0.1` uniquement**.
Elle ne peut ni écrire en base, ni agir sur les boutiques, ni déclencher un
déploiement — et ce n'est pas une discipline, c'est une contrainte technique
(voir *Lecture seule* plus bas).

```bash
npm install
npm start        # http://127.0.0.1:8787
npm test         # 23 tests, sans base — à lancer avant chaque commit
npm run mutation # casse le code une faute à la fois : les tests DOIVENT rougir
npm run preuve   # se connecte à la production et exige que l'écriture échoue
```

## Les quatre écrans

| | | |
|---|---|---|
| ① | **État** | version en ligne, `/health` (champ `database`, pas `status`), base, joueurs actifs, parties du jour et écart avec hier |
| ② | **Joueurs** | liste, recherche, fiche : parties, capitaines, campagne, hauts faits |
| ③ | **Parties** | répartition, **détection de rupture**, jour par jour, par mode, par moment de l'abandon, par écart de score, par capitaine |
| ④ | **Boutiques** | ce qu'affichent réellement l'App Store et Google Play — mots-clés Apple compris |

## Quelle version tourne

```
$ curl -s 127.0.0.1:8787/version
{"service":"pd-bo","sha":"…","court":"dc9cad8","branche":"main",…}
```

Le tampon est aussi **en bas de chaque écran**. Le SHA est lu par `git` au
démarrage, jamais recopié à la main. **Si l'arbre est sale, le tampon porte
`+sale`** : une version qui ne correspond à aucun commit se dénonce elle-même.

## Lecture seule — comment c'est tenu

Quatre gardes, dont **une seule compte vraiment** :

| | garde | où |
|---|---|---|
| **G1** | rôle `bo_lecture` : `GRANT SELECT`, rien d'autre | **PostgreSQL, production** |
| G2 | `ALTER ROLE bo_lecture SET default_transaction_read_only = on` | PostgreSQL |
| G3 | session posée en lecture seule à chaque connexion | `src/lecture/base.mjs` |
| G4 | `lire()` refuse tout texte qui n'est pas `SELECT`/`WITH` | `src/lecture/base.mjs` |

G2–G4 font voir la faute tôt. **La contrainte, c'est G1**, et elle vit hors de ce
dépôt : un backoffice qui *se croit* en lecture seule ne prouve rien.

`npm run preuve` le vérifie contre la vraie base :

```
ok   connecté en bo_lecture — bo_lecture@dice
ok   default_transaction_read_only — on
ok   SELECT sur match autorisé — 2993 lignes
ok   INSERT refusé — cannot execute INSERT in a read-only transaction
ok   UPDATE refusé — cannot execute UPDATE in a read-only transaction
ok   DELETE refusé — cannot execute DELETE in a read-only transaction
ok   DDL refusé — cannot execute CREATE TABLE in a read-only transaction
★ R6 TENUE : lecture possible, écriture impossible.
```

Le SQL qui crée ce rôle est dans [RECONNAISSANCE.md](RECONNAISSANCE.md) §2.

## Configuration

Un fichier `.env` **hors git** (`chmod 600`) :

```
PD_BO_PGHOST=192.168.1.19
PD_BO_PGPORT=5432
PD_BO_PGDATABASE=dice
PD_BO_PGUSER=bo_lecture
PD_BO_PGPASSWORD=…
```

Facultatif : `PD_BO_PORT` (défaut 8787), `PD_BO_JEU` (défaut
`http://192.168.1.19:8100`), `PD_BO_DEPOT_JEU`, `PD_BO_PYTHON`.

⚠️ **L'adresse d'écoute n'est PAS configurable.** `127.0.0.1` est écrit en dur
dans `src/serveur.mjs` : une variable qui pourrait valoir `0.0.0.0` est une
exposition qui attend une faute de frappe.

## Les boutiques

Le backoffice **exécute** `asc.py` et `play_api.py` du dépôt du jeu — il ne les
réécrit pas. Seules leurs options de **lecture** sont atteignables, la liste est
en dur dans `src/lecture/boutiques.mjs`.

⚠️ Une source injoignable affiche **« non lu » avec sa raison exacte**. Il
n'existe aucun chemin de code qui produise une valeur par défaut : mieux vaut un
écran qui dit qu'il ne sait pas qu'un écran qui invente une fiche.

## Les tests

`calcul/` ne connaît ni la base ni HTTP : il prend des lignes, il rend des
nombres. C'est ce qui le rend testable sur données fabriquées.

**Chaque test a été vu rougir** (R10). `npm run mutation` le rejoue à la demande :
il applique 15 fautes, une par une, et exige que la suite échoue. Une mutation
qui survit est nommée — c'est un trou dans les tests, pas un détail.

## Ce que ce dépôt ne fait pas, volontairement

Aucune écriture en base. Aucune action sur les boutiques. Aucun déploiement.
Aucune exposition réseau. `actions/` n'existe pas, et le serveur rend **405 sur
toute méthode autre que GET** — le jour où une action arrivera, il faudra ouvrir
`POST` pour elle seule, et la revue portera sur cette ligne-là.

## Où lire quoi

| fichier | |
|---|---|
| [JOURNAL.md](JOURNAL.md) | append-only, horodaté, échecs compris. **À lire en premier pour reprendre.** |
| [RECONNAISSANCE.md](RECONNAISSANCE.md) | l'environnement mesuré : base, serveur, journaux, boutiques, blocages |
| [ARCHITECTURE.md](ARCHITECTURE.md) | les choix, et leurs raisons |
| [CONSTATS_PARTIES.md](CONSTATS_PARTIES.md) | ce que l'écran ③ a trouvé — et pourquoi la lecture évidente est fausse |
| [COLLECTE_ERREURS.md](COLLECTE_ERREURS.md) | étape 5, chantier partagé avec le dépôt du jeu |
