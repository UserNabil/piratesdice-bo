/* ============================================================================
   lecture/requetes.mjs — les questions posées à la base, une par fonction.

   Toutes paramétrées (R7). Aucune concaténation. Les seules valeurs insérées
   dans le texte passent par `listeBlanche`.

   ⚠️ Ce que le schéma réel impose, et qu'il faut savoir en lisant ce fichier :
   · `match.p1` est le JOUEUR, `match.p2` l'adversaire. En solo, `p2_id` est
     NULL sur les 2 897 lignes solo et `p2_name` est un des 10 noms d'IA.
   · `p1_id` peut être NULL aussi (269 lignes) : la clé étrangère est
     ON DELETE SET NULL, donc une partie survit à l'effacement de son joueur.
     Compter les parties « par joueur » sans le savoir perd ces lignes.
   · Le capitaine joué n'est PAS une colonne. Il vit dans `replay->'capitaines'`
     (tableau [joueur, adversaire]), et `replay` est NULL sur 763 des 2 993
     lignes. Tout découpage par capitaine porte donc sur un sous-ensemble, et
     l'écran doit le dire.
   ============================================================================ */
import { lire, lireUne, listeBlanche } from './base.mjs';

/* --------------------------------------------------------------- écran ① état */

export const compteurs = () => lireUne(`
  SELECT
    (SELECT count(*)::int FROM player)                                     AS joueurs,
    (SELECT count(*)::int FROM match)                                      AS parties,
    (SELECT count(*)::int FROM match WHERE ended_at >= current_date)       AS parties_aujourdhui,
    (SELECT count(*)::int FROM match
      WHERE ended_at >= current_date - 1 AND ended_at < current_date)      AS parties_hier,
    (SELECT count(DISTINCT p1_id)::int FROM match
      WHERE ended_at >= now() - interval '7 days' AND p1_id IS NOT NULL)   AS joueurs_actifs_7j,
    (SELECT count(DISTINCT p1_id)::int FROM match
      WHERE ended_at >= now() - interval '1 day' AND p1_id IS NOT NULL)    AS joueurs_actifs_24h,
    (SELECT max(ended_at) FROM match)                                      AS derniere_partie`);

/** Taux d'abandon aujourd'hui et hier — « ce qui a changé depuis hier ». */
export const abandonsHierEtAujourdhui = () => lire(`
  SELECT ended_at::date AS jour,
         count(*)::int AS total,
         count(*) FILTER (WHERE ended_reason NOT IN ('normal','complete'))::int AS abandons
  FROM match
  WHERE ended_at >= current_date - 1
  GROUP BY 1 ORDER BY 1`);

/* ------------------------------------------------------------ écran ② joueurs */

export function joueurs({ recherche = '', limite = 50, page = 0 } = {}) {
  const n = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const decalage = Math.max(Number(page) || 0, 0) * n;
  /* `recherche` est un PARAMÈTRE, jamais un morceau de texte SQL. */
  return lire(`
    SELECT p.id, p.display_name, p.captain, p.rating, p.games, p.basic_coins,
           (SELECT count(*)::int FROM match m WHERE m.p1_id = p.id) AS parties
    FROM player p
    WHERE ($1 = '' OR p.display_name ILIKE '%' || $1 || '%' OR p.id::text = $1)
    ORDER BY p.rating DESC NULLS LAST, p.id
    LIMIT $2 OFFSET $3`, [String(recherche), n, decalage]);
}

export const joueur = (id) => lireUne(`
  SELECT id, display_name, captain, rating, games, basic_coins
  FROM player WHERE id = $1`, [Number(id)]);

export const partiesDuJoueur = (id, limite = 30) => lire(`
  SELECT id, mode, ended_reason, started_at, ended_at, score1, score2,
         rating1_before, rating1_after, p2_name
  FROM match WHERE p1_id = $1 ORDER BY ended_at DESC LIMIT $2`,
  [Number(id), Math.min(Number(limite) || 30, 200)]);

export const succesDuJoueur = (id) => lire(`
  SELECT a.identify, a.tally, a.cible, pa.claimed_at
  FROM player_achievement pa JOIN achievement a ON a.identify = pa.achievement_id
  WHERE pa.player_id = $1 ORDER BY pa.claimed_at DESC NULLS LAST LIMIT 200`,
  [Number(id)]);

export const capitainesDuJoueur = (id) => lire(`
  SELECT captain_id, xp, rank2_choice, rank3_choice, rank4_choice, updated_at
  FROM captain_progress WHERE player_id = $1 ORDER BY xp DESC`, [Number(id)]);

export const campagneDuJoueur = (id) => lire(`
  SELECT level_id, etoiles FROM campaign_progress
  WHERE player_id = $1 ORDER BY level_id`, [Number(id)]);

/* ------------------------------------------------------------ écran ③ parties */

const MODES = ['tous', 'solo', 'multi'];

/**
 * Les lignes de parties d'une fenêtre, prêtes pour `calcul/parties.mjs`.
 * Le capitaine est extrait du journal de partie, avec sa part d'inconnu assumée.
 */
export function parties({ jours = 30, mode = 'tous' } = {}) {
  const n = Math.min(Math.max(Number(jours) || 30, 1), 365);
  const m = listeBlanche(mode, MODES, 'tous');
  return lire(`
    SELECT id, mode, ended_reason, started_at, ended_at, score1, score2,
           p1_id, p2_id, p2_name,
           replay->'capitaines'->>0 AS capitaine_p1,
           replay->'capitaines'->>1 AS capitaine_p2,
           (replay IS NOT NULL) AS a_journal
    FROM match
    WHERE ended_at >= now() - ($1 || ' days')::interval
      AND ($2 = 'tous' OR mode = $2)
    ORDER BY ended_at`, [String(n), m]);
}

export const modesConnus = () => MODES;

/* ------------------------------------------------------------------ diagnostic */

/** Ce que la base dit d'elle-même — affiché tel quel, sans interprétation. */
export const inventaireTables = () => lire(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name`);
