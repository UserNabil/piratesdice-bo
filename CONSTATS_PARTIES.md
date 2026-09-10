# Ce que l'écran ③ a trouvé — 2026-09-10

Mesuré sur **2 993 parties**, du 18/08 au 10/09/2026, par `bo_lecture` en lecture
seule. Toutes les requêtes sont dans `src/lecture/requetes.mjs`, tous les calculs
dans `src/calcul/parties.mjs` (testé sur données fabriquées).

---

## 1. Le chiffre est confirmé — et il a un cinquième terme

| raison | parties | part | première apparition en base |
|---|---|---|---|
| `quit` | 1 168 | 39,0 % | 18/08 |
| `disconnect` | 825 | 27,6 % | 17/08 |
| `normal` | 606 | 20,2 % | 17/08 |
| **`away`** | **392** | **13,1 %** | **25/08** |
| `complete` | 2 | 0,1 % | 28/08 |

**Fins anormales : 79,7 %.** Ton chiffre de 79 % est juste.

⚠️ Les 10 % qui manquaient à ton compte (41 + 28 + 21 = 90) sont **`away`**, une
raison dont tu n'avais pas connaissance.

---

## 2. ⛔ LA LECTURE ÉVIDENTE EST FAUSSE : le taux n'a pas « sauté »

L'écran trouve une rupture au **21/08** : 58,3 % avant, 81,4 % après, **23 points**.
Un défaut mis en production ce jour-là est l'explication qui vient en premier.

**Elle ne tient pas.** Trois mesures la contredisent :

1. **`away` n'existe pas avant le 25/08.** Zéro ligne. Puis 37 le premier jour.
2. **`complete` n'existe pas avant le 28/08.** Deux lignes en tout.
3. **`quit` existe dès le 18/08 mais reste à 1–3 par jour** jusqu'au 23/08, où il
   passe à 28. Le dépôt du jeu explique pourquoi : *« Le protocole dit `leave`,
   pas `quit` — mon `{t:'quit'}` partait dans le vide »* (`RAPPORT_NUIT.md:1186`).
   **Les abandons volontaires n'étaient pas enregistrés comme tels.**

Or `settleMatch` écrit `reason || 'normal'` : **une fin dont la raison n'arrive
pas est comptée comme normale.** Avant que le vocabulaire soit complet, une part
des abandons se rangeait donc dans `normal`.

> **Conséquence : le taux d'abandon d'août n'est pas 58 %, il est inconnu et plus
> élevé. Le « saut » de 23 points mesure le moment où on s'est mis à regarder,
> pas un changement de comportement des joueurs.**

C'est le motif que le projet connaît déjà : *« la majorité des défauts criés par
un outil de mesure sont les défauts de l'outil »*. L'écran affiche donc le
**mélange** à côté du taux, et porte l'avertissement en toutes lettres.

⚠️ **Corollaire à ne pas manquer** : aucune conclusion sur une tendance ne sera
solide avant le **25/09** — un mois de données sous vocabulaire stable. Toute
comparaison avec août est aujourd'hui sans valeur.

---

## 3. Ce qui reste vrai quoi qu'il arrive, et qui est le vrai sujet

Ces mesures ne dépendent d'aucun nom de raison. Elles sont calculées sur des
horodatages et des scores.

### 981 parties sur 2 993 — **un tiers** — durent moins de 10 secondes

Et **99,8 % d'entre elles finissent mal.** Aucune n'a une durée nulle (contrôlé :
0 ligne avec `ended_at = started_at`), donc ce n'est pas un artefact d'écriture.

| durée | parties | fins anormales |
|---|---|---|
| **moins de 10 s** | **981** | **99,8 %** |
| 10 à 30 s | 209 | 98,6 % |
| 30 à 60 s | 803 | 91,4 % |
| 1 à 3 min | 793 | 52,7 % |
| plus de 3 min | 207 | 23,2 % |

### Le score du joueur est **zéro** dans toutes les fins anormales

| raison | score moyen du joueur | parties |
|---|---|---|
| `quit` | **0,17** | 1 168 |
| `disconnect` | **0,00** | 825 |
| `away` | **0,02** | 392 |
| `normal` | 47,29 | 606 |

> **2 385 parties sur 2 993 (80 %) se terminent sans que le joueur ait marqué un
> seul point.** Ce n'est pas un joueur qui abandonne une partie mal engagée :
> c'est un joueur qui **ne joue pas du tout**.

834 des 1 168 `quit` surviennent en moins de 10 secondes. La question n'est donc
pas « pourquoi abandonnent-ils ? » mais **« qu'est-ce qui les empêche de
commencer ? »**.

⚠️ Je ne sais pas ce que c'est, et je ne le devinerai pas depuis la base. Les
pistes se départagent avec la collecte d'erreurs (voir `COLLECTE_ERREURS.md`) :
un écran noir, un chargement qui n'aboutit pas, un tutoriel qu'on ferme. **Aucune
de ces trois hypothèses n'est distinguable des deux autres avec les données
actuelles.**

---

## 4. Les autres découpages

### Par mode — 97 % du jeu est solo

| mode | parties | fins anormales |
|---|---|---|
| solo | 2 897 | 80,0 % |
| multi | 96 | 68,8 % |

⚠️ **Le multijoueur, c'est 3 % des parties.** Tout raisonnement sur « les parties »
parle en réalité du solo. À garder en tête avant d'investir dans le temps réel.

### Par capitaine — le premier n'en est pas un

| capitaine | parties | fins anormales |
|---|---|---|
| **`read`** | **1 148** | **87,8 %** |
| `ching` | 493 | 81,3 % |
| `omalley` | 201 | 69,7 % |
| `teach` | 169 | 87,0 % |
| `jack` | 77 | 77,9 % |
| `sparrow` | 37 | 64,9 % |

⚠️ **`read` est la valeur par DÉFAUT** posée par `026_capitaine_toujours.sql`.
Le plus gros groupe n'est pas « les joueurs qui ont choisi `read` », c'est
**« les joueurs qui n'ont rien choisi »** — et c'est le groupe qui abandonne le
plus. Cohérent avec §3 : ils partent avant d'arriver au choix.

⚠️ Ce découpage ne porte que sur les **2 230 parties qui ont un journal**
(`replay`), pas sur 2 993 : le capitaine joué n'est pas une colonne de `match`,
il est lu dans `replay->'capitaines'`. 763 parties en sont absentes. L'écran le
dit.

⚠️ 14 capitaines sont sous les 20 parties et **écartés du classement**, pas
cachés : un capitaine joué deux fois, deux fois abandonné, afficherait 100 % et
se placerait en tête.

### Par écart de score

| écart | parties | fins anormales |
|---|---|---|
| 1 à 10 | 1 922 | 92,5 % |
| 11 à 30 | 641 | 63,0 % |
| 31 à 60 | 343 | 49,6 % |
| plus de 60 | 78 | 41,0 % |

Lecture : l'écart est petit **parce que la partie s'arrête tôt**, pas l'inverse.
C'est le même fait que §3 vu sous un autre angle, pas une deuxième découverte.

---

## 5. Ce que je recommande, dans l'ordre

1. **Ne rien conclure sur la tendance avant le 25/09.** Le vocabulaire des
   raisons n'est stable que depuis le 28/08.
2. **Brancher la collecte d'erreurs** (`COLLECTE_ERREURS.md`). C'est la seule
   chose qui départagera les hypothèses du §3. Tant qu'elle n'est pas là, toute
   explication des 981 parties de moins de 10 secondes est une opinion.
3. **Regarder ce que voit un joueur dans ses dix premières secondes**, sur un
   téléphone réel, capitaine non choisi. C'est reproductible aujourd'hui, sans
   rien développer.
4. **Ajouter une raison `abandon_avant_premier_coup`** côté jeu — distinguer
   « parti sans jouer » de « parti en cours de partie » ferait la moitié du
   diagnostic à elle seule, et coûte une ligne dans `match.js`.

---

## Ce qui reste OUVERT

- **Pourquoi** un tiers des parties dure moins de 10 secondes. Mesuré, pas expliqué.
- Si `disconnect` recouvre du réseau mobile normal ou une coupure serveur : rien
  dans `match` ne les distingue.
- L'historique s'arrête au **18/08**. Le jeu existe depuis des mois : soit `match`
  a été purgée, soit elle est récente. **Non élucidé.**
