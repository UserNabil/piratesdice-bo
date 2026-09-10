# Architecture proposée — backoffice The Pirate's Dice

**Proposition. Rien n'est construit.** À valider avant l'étape 3.

Contrainte de départ, qui décide presque tout : *« je dois pouvoir le maintenir
moi-même »* et *« chaque couche est une couche à maintenir »*. Tout ce qui suit
est un arbitrage contre l'ajout de couches.

---

## 1. La technologie, et pourquoi

**Node 22 + `pg`. Une seule dépendance. Aucune étape de build.**

| choix | raison |
|---|---|
| **Node** | Node v22.14.0 est déjà sur la machine **[MESURÉ]**, et le serveur de jeu est en Node : **un seul langage à maintenir** pour les deux moitiés. Le jour où la collecte d'erreurs se branche (étape 5), le même code se relit des deux côtés. |
| **`pg`, et rien d'autre** | C'est le pilote qu'utilise déjà le serveur de jeu (`db.js`, pool `max:8`). Même pilote, mêmes comportements, mêmes pièges connus. |
| **`node --test`** | Livré avec Node. Pas de Jest, pas de Vitest, pas de configuration. Le jeu s'en sert déjà (`node --test test/*.test.mjs`). Un lanceur de tests est une couche : celle-ci est gratuite. |
| **`node:http` nu** | Pas d'Express. Le backoffice sert ~8 chemins à un seul utilisateur sur `127.0.0.1`. Un routeur de 40 lignes se lit en entier ; un framework se maintient. |
| **HTML rendu côté serveur** | Pas de React, pas de bundler, pas de `node_modules` à reconstruire. On ouvre le fichier, on voit la page. **Aucune étape de build ne peut donc être « oubliée ».** |

### Ce que ça donne au démarrage

```
npm start          # -> écoute sur 127.0.0.1:8787
npm test           # -> node --test, avant chaque commit
```

Une commande. Pas de conteneur, pas de service, pas de `docker compose`.

### Ce que j'écarte, et pourquoi

- **Docker** : Docker Desktop est installé mais le démon était arrêté **[SECOND]**.
  Ajouter un démon entre toi et ton outil, pour un binaire Node déjà présent, ne
  paie pas.
- **Un framework front** : la valeur est dans les requêtes SQL, pas dans l'interface.
- **Python** (alors que `asc.py`/`play_api.py` le sont) : le backoffice les
  **appellera** sans les réécrire (§4). Un outil peut appeler un outil d'un autre
  langage ; il n'a pas à en adopter le langage.

---

## 2. Comment il lit la base sans jamais pouvoir écrire

**Quatre gardes indépendantes.** Chacune seule suffirait à laisser passer une
faute ; c'est leur superposition qui rend l'écriture impossible.

| # | garde | où elle vit | ce qu'elle attrape |
|---|---|---|---|
| G1 | rôle `bo_lecture` : `GRANT SELECT` et rien d'autre | **PostgreSQL, sur la production** | tout, y compris un backoffice entièrement compromis |
| G2 | `ALTER ROLE bo_lecture SET default_transaction_read_only = on` | **PostgreSQL** | un `GRANT` accordé par erreur plus tard |
| G3 | `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` à chaque connexion | backoffice, à l'ouverture du pool | une base où G1/G2 n'auraient pas été posées |
| G4 | toute requête passe par un `lire()` unique qui **refuse** un texte SQL ne commençant pas par `SELECT` ou `WITH` | backoffice, un seul point de passage | une requête écrite trop vite pendant le développement |

⚠️ **G1 est la seule qui compte vraiment.** G2, G3 et G4 sont des filets : elles
rendent la faute *visible tôt*, mais la contrainte technique demandée par R6, c'est
G1 — et elle est **hors** du backoffice. Un backoffice qui se croit en lecture
seule sans G1 ne prouve rien.

**La preuve, et non la déclaration** (R10) : un test tente un `INSERT` avec le
rôle réel et **exige l'échec**. Tant que ce test n'a pas été vu rougir (en le
pointant sur un rôle qui, lui, peut écrire), il ne prouve rien non plus.

### R7 — requêtes paramétrées

`lire(texte, params)` transmet `params` à `pool.query(texte, params)`, comme le
`q()` du serveur de jeu. **Aucune concaténation.** Les identifiants qui ne peuvent
pas être paramétrés (nom de colonne d'un tri, sens du tri) passent par une
**liste blanche** — un `ORDER BY` ne prend jamais une chaîne venue de l'URL.

---

## 3. Comment on saura quelle version du backoffice tourne

Copie exacte du modèle du jeu, parce qu'il a fait ses preuves :

- **`GET /version`** rend `{sha, court, branche, date, demarre, service:"pd-bo"}`.
  Le SHA est lu **au démarrage** par `git rev-parse HEAD`, pas écrit à la main.
- **Le tampon est affiché en bas de chaque écran** : `pd-bo 3f2a1c8 · 10/09 14:22`.
  Répondre à « quel code tourne » demande de **regarder**, pas de chercher.
- Si l'arbre est sale au démarrage, le tampon porte `+sale`. Une version qui ne
  correspond à aucun commit doit se dénoncer elle-même.

---

## 4. Comment il joindra les API des boutiques

**Il ne les réimplémente pas. Il exécute `asc.py` et `play_api.py`** en
sous-processus et lit leur JSON.

```
lecture/boutiques/apple.js  ->  python asc.py get "/v1/apps/..."
lecture/boutiques/google.js ->  python play_api.py --brut
```

| pourquoi | |
|---|---|
| tu l'as demandé | « ces deux outils existent déjà, ne les réécris pas » |
| une seule vérité | la signature JWT ES256, la découverte de la clé, le piège des pistes Play : tout ça vit **déjà** dans ces fichiers et y a été durci |
| aucun secret ne rentre | le backoffice ne voit jamais la clé `.p8` ni le compte de service |

⚠️ **Seules les options de LECTURE sont appelées** : `asc.py get`, `play_api.py
--check/--brut/--historique/--details`. `--listing`, `--upload`, `--promote`,
`--sortie` écrivent chez Google : ils ne sont pas dans la liste blanche, et la
liste blanche est en dur dans le code.

### L'état « non lu », qui est un vrai état

Chaque source rend :

```js
{ etat: 'lu' | 'non-lu', a: '2026-09-10T14:22:03+02:00', raison: '...', donnees: {...} }
```

`non-lu` **s'affiche**, avec sa raison exacte (`clé absente`, `HTTP 401`,
`délai dépassé`). **Il n'y a aucun chemin de code qui produise une valeur par
défaut.** Aujourd'hui, les deux boutiques rendront `non-lu` — c'est mesuré
(§4 de la reconnaissance), et c'est ce que l'écran ④ affichera.

---

## 5. Ce qui rend les actions futures ajoutables sans tout reprendre

La séparation est **par capacité**, pas par écran :

```
lecture/     ← tout ce qui existe aujourd'hui. Ne peut pas écrire (G1..G4).
  base/        requêtes SQL, une fonction par question
  calcul/      agrégations pures — testées sans base (étape 4)
  boutiques/   appels asc.py / play_api.py, lecture seule
  jeu/         /version, /health, journald

actions/     ← n'existe pas. Le dossier n'est pas créé.
```

Trois points font que l'ajout ultérieur ne demande pas de reprise :

1. **Le serveur HTTP ne monte que des `GET`.** Une méthode `POST` rend `405`
   avant tout routage. Le jour où une action arrive, on ouvre `POST` **pour elle
   seule** — et ce jour-là, la revue porte sur une ligne, pas sur l'ensemble.
2. **Les écritures futures ne passeront pas par `bo_lecture`.** Elles demanderont
   un second rôle, une seconde connexion, explicite. G1 continue de couvrir la
   moitié lecture même après.
3. **Le calcul est déjà séparé de l'accès.** `calcul/` ne connaît ni la base ni
   HTTP : il prend des lignes, il rend des nombres. C'est ce qui rend l'étape 4
   possible sans base — et ça ne changera pas quand les actions arriveront.

⚠️ Je ne construis **aucun** point d'extension à l'avance : pas de couche
« commandes », pas de bus, pas d'interface abstraite en attente d'un second
implémenteur. Une couche construite pour un besoin futur est une couche à
maintenir **aujourd'hui** pour un besoin qui n'existe **pas encore**.

---

## 6. Les quatre écrans

| | écran | source | dépend de |
|---|---|---|---|
| ① | **État** | `/version` + `/health` du jeu, base, journald | B1, B2 |
| ② | **Joueurs** | base | B1 |
| ③ | **Parties** | base | **B1 — entièrement** |
| ④ | **Boutiques** | `asc.py`, `play_api.py` | B3, B4 — sinon « non lu » |

### Sur l'écran ② — ce sont des personnes réelles

N'est affiché que ce qui sert à administrer : identifiant interne, nom
d'affichage, capitaine, classement, parties, progression, hauts faits.
**Ne sont pas affichés** : le secret d'appareil, le `deviceId` brut, les sujets
Apple/Google, toute adresse. Un identifiant d'alias est **tronqué** (`sea-43ea…`).
Aucune recherche par identité de fournisseur.

### Sur l'écran ③ — ce qu'il faut trancher

79 % de fins anormales sur 2 888 parties. Les découpages demandés — dans le temps,
par mode, par moment de l'abandon, par capitaine, par écart de score — **ne sont
pas concevables avant d'avoir lu `\d match`** (B1). Je sais que la colonne de
raison existe (`reason: reason || 'normal'`) ; je ne connais ni son nom, ni les
autres colonnes.

⚠️ Un point que la mesure devra trancher avant toute conclusion : **`disconnect`
n'est pas forcément un défaut.** Un joueur mobile qui passe sous un tunnel produit
un `disconnect` légitime. Ce que l'écran doit montrer d'abord, c'est **une rupture
dans le temps** — un taux qui saute à une date — car c'est la seule forme qui
distingue un défaut mis en production d'un comportement normal d'application
mobile. Le reste des découpages sert à localiser la cause **une fois** la rupture
vue.

---

## 7. Les tests (étape 4)

- **`calcul/` est testé sans base**, sur des lignes fabriquées. C'est là que vit
  tout ce qui pourrait être faux sans qu'on le voie : taux, fenêtres glissantes,
  découpages, détection de rupture.
- **Chaque test est vu rougir avant d'être gardé** (R10). Le journal note, pour
  chaque test, **ce qui a été cassé** pour le faire échouer et le message obtenu.
  Un test dont je n'ai pas le log de rougissement est **NON VÉRIFIÉ**.
- **`npm test` avant chaque commit.**
- **Pas de test de mise en page** — coûteux, et n'attrape rien ici.

---

## 8. Ce que je ne construis pas

Aucune écriture en base. Aucune action sur les boutiques. Aucun déploiement.
Aucune exposition réseau : `server.listen(8787, '127.0.0.1')` — l'adresse est
**en dur**, pas configurable. Une variable d'environnement qui peut valoir
`0.0.0.0` est une exposition qui attend une faute de frappe.
