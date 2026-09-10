/* ============================================================================
   lecture/base.mjs — le SEUL endroit qui parle à PostgreSQL.

   R6 : la base de production est en lecture seule. La garde qui compte vit
   DANS PostgreSQL (rôle `bo_lecture`, SELECT et rien d'autre, plus
   `default_transaction_read_only`). Ce fichier ajoute deux filets — utiles
   pour voir la faute tôt, mais qui ne prouvent rien à eux seuls :

     · la session est posée en lecture seule à chaque connexion ;
     · `lire()` refuse tout texte qui n'est pas une lecture.

   R7 : `lire(texte, params)` transmet `params` à `pool.query`. Aucune
   concaténation, jamais. Ce qui ne peut pas être paramétré (un nom de colonne
   de tri) passe par `listeBlanche()`.
   ============================================================================ */
import { readFileSync } from 'node:fs';
import pg from 'pg';

function env() {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../../.env', import.meta.url), 'utf8')
        .split('\n').filter((l) => l.trim() && !l.startsWith('#'))
        .map((l) => l.split(/=(.*)/s).slice(0, 2)));
  } catch { return {}; }
}

const e = { ...env(), ...process.env };

export const CONFIGUREE = Boolean(e.PD_BO_PGHOST && e.PD_BO_PGUSER && e.PD_BO_PGPASSWORD);

const pool = CONFIGUREE ? new pg.Pool({
  host: e.PD_BO_PGHOST,
  port: Number(e.PD_BO_PGPORT || 5432),
  database: e.PD_BO_PGDATABASE || 'dice',
  user: e.PD_BO_PGUSER,
  password: e.PD_BO_PGPASSWORD,
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
}) : null;

/* Une erreur sur un client inactif ne doit pas tuer le processus.
   Même garde que `db.js` côté serveur de jeu. */
pool?.on('error', (err) => console.error('[base] client inactif :', err.message));

/* Filet : chaque nouvelle connexion se pose en lecture seule. */
pool?.on('connect', (client) => {
  client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    .catch((err) => console.error('[base] session non posée en lecture seule :', err.message));
});

/** Un texte SQL est-il une lecture ? Commentaires et blancs de tête ignorés. */
export function estLecture(texte) {
  const nu = String(texte)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
  return /^(select|with)\b/i.test(nu) && !/;\s*\S/.test(nu);
}

/**
 * Exécute une lecture. Rejette AVANT d'atteindre la base si le texte n'en est
 * pas une — pour que la faute se voie au développement, pas en production.
 */
export async function lire(texte, params = []) {
  if (!pool) throw new Error('base non configurée : .env absent ou incomplet');
  if (!estLecture(texte)) throw new Error('refus : seules les lectures (SELECT/WITH) sont permises ici');
  const r = await pool.query(texte, params);
  return r.rows;
}

export const lireUne = async (texte, params = []) => (await lire(texte, params))[0] ?? null;

/**
 * Le seul moyen d'insérer un identifiant dans du SQL. Rend la valeur d'origine
 * uniquement si elle figure dans la liste des valeurs permises.
 */
export function listeBlanche(valeur, permises, defaut) {
  return permises.includes(valeur) ? valeur : defaut;
}

/** État de la base, pour l'écran ①. Ne jette pas : rend l'échec comme un état. */
export async function sante() {
  if (!pool) return { etat: 'non-lu', raison: '.env absent ou incomplet' };
  try {
    const t0 = Date.now();
    const r = await lireUne('SELECT current_user AS qui, now() AS maintenant');
    return { etat: 'lu', qui: r.qui, maintenant: r.maintenant, ms: Date.now() - t0 };
  } catch (err) {
    return { etat: 'non-lu', raison: err.message };
  }
}

export const fermer = () => pool?.end();
