/* ============================================================================
   preuve_lecture_seule.mjs — R6, prouvée et non déclarée.

   Un backoffice qui SE CROIT en lecture seule ne prouve rien. Ce script se
   connecte avec le rôle réel, lit, puis TENTE D'ÉCRIRE et exige l'échec.

   Il sort en code 1 si l'écriture réussit — c'est le seul résultat qui compte.
   ============================================================================ */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const pool = new pg.Pool({
  host: env.PD_BO_PGHOST,
  port: Number(env.PD_BO_PGPORT),
  database: env.PD_BO_PGDATABASE,
  user: env.PD_BO_PGUSER,
  password: env.PD_BO_PGPASSWORD,
  max: 2,
  connectionTimeoutMillis: 8000,
});

let echecs = 0;
const dire = (ok, quoi, detail) => {
  if (!ok) echecs += 1;
  console.log(`${ok ? 'ok  ' : 'ECHEC'} ${quoi}${detail ? ' — ' + detail : ''}`);
};

try {
  const qui = await pool.query('SELECT current_user, current_database()');
  dire(qui.rows[0].current_user === 'bo_lecture',
       'connecté en bo_lecture', `${qui.rows[0].current_user}@${qui.rows[0].current_database}`);

  const ro = await pool.query('SHOW default_transaction_read_only');
  dire(ro.rows[0].default_transaction_read_only === 'on',
       'default_transaction_read_only', ro.rows[0].default_transaction_read_only);

  const n = await pool.query('SELECT count(*)::int AS n FROM match');
  dire(n.rows[0].n > 0, 'SELECT sur match autorisé', `${n.rows[0].n} lignes`);

  /* Le point du script. Une écriture DOIT échouer. */
  for (const [quoi, sql] of [
    ['INSERT', "INSERT INTO match (mode, p1_name, p2_name) VALUES ('preuve', 'a', 'b')"],
    ['UPDATE', "UPDATE player SET display_name = display_name WHERE id = -1"],
    ['DELETE', 'DELETE FROM match WHERE id = -1'],
    ['DDL',    'CREATE TABLE preuve_bo_lecture (x int)'],
  ]) {
    try {
      await pool.query(sql);
      dire(false, `${quoi} refusé`, '⛔ LA REQUÊTE EST PASSÉE');
    } catch (e) {
      dire(true, `${quoi} refusé`, e.message.split('\n')[0]);
    }
  }
} finally {
  await pool.end();
}

console.log(echecs === 0
  ? '\n★ R6 TENUE : lecture possible, écriture impossible.'
  : `\n⛔ ${echecs} CONTRÔLE(S) EN ÉCHEC — R6 N'EST PAS TENUE.`);
process.exit(echecs === 0 ? 0 : 1);
