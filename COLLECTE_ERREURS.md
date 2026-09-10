# Étape 5 — la collecte d'erreurs : proposition

**Rien n'est construit. Le dépôt du jeu n'a pas été modifié.**

Aujourd'hui : une exception chez un joueur ne quitte jamais son téléphone. Un
effet cassé pour 144 joueurs produit une ligne dans un journal que personne ne
lit. Le backoffice est l'endroit où ça doit s'afficher — mais **la route de
collecte vit côté serveur de jeu**. C'est donc un chantier partagé, et cette
page dit exactement ce qu'il faut ajouter, où, et ce que ça coûte.

---

## Ce qui manque, dans l'ordre

| # | où | quoi | pourquoi |
|---|---|---|---|
| 1 | client (`app/js`, `www/js`) | un attrape-tout `window.onerror` + `unhandledrejection` | c'est le seul endroit qui voit l'exception du joueur |
| 2 | serveur de jeu | `POST /api/incident` — reçoit, borne, écrit | une route, pas un service |
| 3 | serveur de jeu | table `incident` | une ligne par exception, gardée 30 jours |
| 4 | backoffice | écran ① « dernières erreurs » | lecture seule, comme le reste |

---

## 1. Côté client — l'attrape-tout

Le point délicat n'est pas d'attraper : c'est de **ne pas noyer**.

```js
/* Un joueur dont la boucle de rendu jette produit 60 erreurs par seconde.
   Sans regroupement, une seule session remplit la table. */
const vues = new Map();          // signature -> {n, dernier}
const SIGNATURE = (e) => `${e.message}|${e.filename}:${e.lineno}`;

function remonter(e) {
  const s = SIGNATURE(e);
  const v = vues.get(s) || { n: 0, envoye: 0 };
  v.n += 1;
  vues.set(s, v);
  // Envoi : la 1re, la 5e, la 25e… puis plus rien. Le compteur part avec.
  if (v.n === 1 || v.n === 5 || v.n === 25) envoyer(s, v.n, e);
}
```

⚠️ **L'envoi ne doit jamais casser le jeu.** `fetch(...).catch(() => {})`, un
délai borné, et **aucun `await`** sur le chemin de rendu. Une remontée d'erreur
qui bloque la partie est pire que l'erreur.

⚠️ **Rien d'identifiant.** Pas de `deviceId`, pas de nom. Le `playerId` interne
suffit à retrouver le joueur côté base, et il ne dit rien à qui lirait la table.

## 2. Côté serveur — une route, et ses bornes

```
POST /api/incident
{ sig, message, pile, ligne, n, version, plateforme }
```

- **corps borné** — `http.js` lit déjà à 64 Ko max, c'est le bon ordre ;
- **pile tronquée à 2 000 caractères** avant écriture ;
- **limitation par joueur** : 20 incidents par heure, au-delà on compte sans
  écrire. ⚠️ La clé de limitation doit être le **playerId résolu par le jeton**,
  jamais une valeur envoyée par le client — l'audit a trouvé exactement ce défaut
  dans `device.js` (`rateOk`, finding F2 : clé contrôlable par le client) ;
- **pas d'authentification obligatoire** : une erreur au démarrage arrive avant
  le jeton. Les incidents sans joueur sont acceptés et marqués comme tels.

## 3. La table

```sql
CREATE TABLE IF NOT EXISTS incident (
  id          bigserial PRIMARY KEY,
  vu_le       timestamptz NOT NULL DEFAULT now(),
  player_id   integer REFERENCES player(id) ON DELETE SET NULL,
  signature   text NOT NULL,
  message     text NOT NULL,
  pile        text,
  version     text,
  plateforme  text,
  n           integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS incident_recent ON incident (vu_le DESC);
CREATE INDEX IF NOT EXISTS incident_signature ON incident (signature, vu_le DESC);
```

⚠️ **Deux pièges déjà payés par le jeu, à ne pas rejouer :**

1. `migrate.js` n'a **aucune table `schema_migrations`** : tous les `.sql` sont
   rejoués à chaque démarrage. Cette migration doit donc être **idempotente**
   (`IF NOT EXISTS` partout) — sinon le deuxième démarrage échoue.
2. **La rétention doit être portée par le dépôt**, pas posée à la main. Les
   journaux journald avaient atteint 936 Mo pour cette raison exacte. Un
   `DELETE FROM incident WHERE vu_le < now() - interval '30 days'` au démarrage,
   ou une tâche, mais **dans le dépôt**.

## 4. Côté backoffice

Rien à inventer : `lecture/requetes.mjs` gagne une fonction, l'écran ① remplace
son bloc « non lu » par un tableau. **Aucune écriture**, `bo_lecture` a déjà le
`SELECT` sur toute table future grâce à `ALTER DEFAULT PRIVILEGES`.

⚠️ **À vérifier le jour où la table existe** : le `ALTER DEFAULT PRIVILEGES` a
été posé `FOR ROLE dice`. Si la migration crée la table sous un autre rôle, le
`GRANT` n'est pas hérité et le backoffice ne verra rien. Le contrôle est une
ligne : `npm run preuve` doit continuer à lire 20 tables au lieu de 19.

---

## Le raccordement, en une image

```
téléphone  ──POST /api/incident──►  serveur de jeu  ──INSERT──►  table incident
                                                                      │
                                                              SELECT (bo_lecture)
                                                                      ▼
                                                              backoffice, écran ①
```

Le backoffice ne parle jamais au téléphone, et n'écrit jamais. Il lit une table
de plus. **C'est tout le raccordement** — et c'est voulu : si la collecte demande
au backoffice de devenir un service qui reçoit, il faut l'exposer, et un outil
exposé n'est plus l'outil qu'on a décrit.

---

## Ce que ça demande de toi

1. **Ton accord pour modifier le dépôt du jeu** — trois fichiers : un attrape-tout
   client, une route dans `http.js`, une migration SQL. Je ne touche rien sans.
2. Le déploiement passe par la fenêtre creuse (**03h–06h UTC**, R14.5 du jeu).

## Ce qu'il ne faut PAS faire

- ⛔ **Pas de service tiers.** Une exception de joueur contient des chemins, des
  états de partie, parfois un pseudo. Ça reste sur ta machine.
- ⛔ **Pas de collecte avant les bornes.** Une route qui écrit sans limite est un
  moyen de remplir ton disque depuis n'importe quel téléphone.
