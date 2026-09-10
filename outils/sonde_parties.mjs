/* Sonde exploratoire — lecture seule. Réécrite au fil des questions. */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const pool = new pg.Pool({
  host: env.PD_BO_PGHOST, port: Number(env.PD_BO_PGPORT),
  database: env.PD_BO_PGDATABASE, user: env.PD_BO_PGUSER,
  password: env.PD_BO_PGPASSWORD, max: 2, connectionTimeoutMillis: 8000,
});

const montre = async (titre, sql) => {
  console.log('\n=== ' + titre + ' ===');
  const r = await pool.query(sql);
  for (const row of r.rows) console.log(JSON.stringify(row));
};

try {
  await montre('solo : qui est p1, qui est p2', `
    SELECT mode,
           count(*) FILTER (WHERE p1_id IS NULL)::int AS p1_null,
           count(*) FILTER (WHERE p2_id IS NULL)::int AS p2_null,
           count(DISTINCT p2_name)::int AS noms_p2_distincts,
           count(*) FILTER (WHERE score1 = 0)::int AS score1_zero,
           count(*) FILTER (WHERE score2 = 0)::int AS score2_zero
    FROM match GROUP BY 1`);

  await montre('noms p2 les plus frequents en solo', `
    SELECT p2_name, count(*)::int AS n FROM match WHERE mode='solo'
    GROUP BY 1 ORDER BY n DESC LIMIT 5`);

  await montre('par jour : part des fins anormales (ou est la rupture)', `
    SELECT ended_at::date AS jour, count(*)::int AS parties,
           round(100.0 * count(*) FILTER (WHERE ended_reason <> 'normal')
                 / nullif(count(*), 0), 1) AS pct_anormal,
           round(100.0 * count(*) FILTER (WHERE ended_reason = 'quit')
                 / nullif(count(*), 0), 1) AS pct_quit
    FROM match GROUP BY 1 ORDER BY 1`);

  await montre('quit : combien finissent a 0 point cote joueur, et en combien de temps', `
    SELECT width_bucket(extract(epoch FROM (ended_at - started_at)), 0, 60, 6) AS tranche_10s,
           count(*)::int AS n
    FROM match WHERE ended_reason = 'quit' GROUP BY 1 ORDER BY 1`);

  await montre('forme de replay.capitaines', `
    SELECT replay->'capitaines' AS capitaines, replay->'v' AS version,
           jsonb_array_length(replay->'coups') AS nb_coups
    FROM match WHERE replay IS NOT NULL ORDER BY ended_at DESC LIMIT 3`);

  await montre('capitaine du joueur (replay) x raison de fin', `
    SELECT replay->'capitaines'->>0 AS capitaine_p1, ended_reason,
           count(*)::int AS n
    FROM match WHERE replay IS NOT NULL
    GROUP BY 1,2 ORDER BY 1, n DESC LIMIT 25`);
} finally {
  await pool.end();
}
