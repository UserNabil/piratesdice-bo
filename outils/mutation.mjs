/* ============================================================================
   mutation.mjs — R10, automatisée.

   « Un test qui ne peut pas rougir ne prouve rien. » Ce banc casse le code, une
   faute à la fois, et exige que la suite ROUGISSE. Une mutation qui survit est
   un trou dans les tests, et elle est nommée.

   Il ne modifie rien durablement : chaque source est restaurée en `finally`,
   y compris si le processus échoue.
   ============================================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CALCUL = new URL('../src/calcul/parties.mjs', import.meta.url);
const BASE = new URL('../src/lecture/base.mjs', import.meta.url);

/* Chaque mutation : un nom, le texte à remplacer, son remplacement, la source.
   Le nom dit quelle FAUTE est simulée, pas quelle ligne est touchée. */
const MUTATIONS = [
  ['la garde SQL ne regarde que le premier mot, commentaires compris',
   ".replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ')", '', BASE],

  ['la garde SQL laisse passer une seconde instruction après le point-virgule',
   '&& !/;\\s*\\S/.test(nu)', '', BASE],

  ['la liste blanche rend la valeur reçue au lieu du défaut',
   'return permises.includes(valeur) ? valeur : defaut;', 'return valeur ?? defaut;', BASE],

  ['`complete` recompté comme un abandon',
   "new Set([FIN_NORMALE, 'complete'])", 'new Set([FIN_NORMALE])'],

  ['taux sur zéro partie rendu comme 0 % au lieu de « on ne sait pas »',
   'if (!lignes.length) return null;', 'if (!lignes.length) return 0;'],

  ['série par jour rendue dans le désordre',
   'a.jour.localeCompare(b.jour))', 'b.jour.localeCompare(a.jour))'],

  ['rupture cherchée jusqu’aux extrémités de la série',
   'minParCote = 3', 'minParCote = 0'],

  ['rupture non pondérée : un jour creux pèse autant qu’un jour de pointe',
   'return arrondi(100 * serie.reduce((n, e) => n + (e[champ] || 0), 0) / total);',
   'return arrondi(serie.reduce((n, e) => n + 100 * (e[champ] || 0) / (e.total || 1), 0) / serie.length);'],

  ['groupes sous le seuil mélangés aux autres',
   'groupes: groupes.filter((g) => g.n >= minimum)', 'groupes: groupes.filter(() => true)'],

  ['lignes sans clé comptées dans un groupe fantôme',
   'if (k === null || k === undefined) continue;', 'if (false) continue;'],

  ['borne de tranche du mauvais côté (10 s classé « moins de 10 s »)',
   'TRANCHES.find((t) => d < t.max).nom', 'TRANCHES.find((t) => d <= t.max).nom'],

  ['égalité de score confondue avec un petit écart',
   "if (e === 0) return 'égalité';", "if (e < 0) return 'égalité';"],

  ['date illisible rendue comme une durée au lieu de null',
   'if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return null;', ''],

  ['pourcentage de répartition toujours à zéro',
   'pct: total ? arrondi(100 * n / total) : 0', 'pct: 0'],

  ['jour découpé en heure locale plutôt qu’en UTC',
   "new Date(t).toISOString().slice(0, 10)", "new Date(t).toString().slice(0, 10)"],
];

const originaux = new Map([CALCUL, BASE].map((u) => [u.href, readFileSync(u, 'utf8')]));
const survivantes = [];
let tuees = 0;

try {
  for (const [nom, cherche, remplace, src = CALCUL] of MUTATIONS) {
    const original = originaux.get(src.href);
    if (!original.includes(cherche)) {
      console.log(`⛔ MUTATION INAPPLICABLE — « ${nom} » : le texte visé n'existe plus.`);
      survivantes.push(nom + ' (inapplicable)');
      continue;
    }
    writeFileSync(src, original.replace(cherche, remplace));
    let rouge = false;
    try {
      execFileSync(process.execPath,
                   ['--test', 'test/parties.test.mjs', 'test/garde_sql.test.mjs'],
                   { stdio: 'pipe', cwd: new URL('..', import.meta.url) });
    } catch { rouge = true; }
    console.log(`${rouge ? 'TUÉE  ' : 'SURVIT'} — ${nom}`);
    if (rouge) tuees += 1; else survivantes.push(nom);
    writeFileSync(src, original);
  }
} finally {
  for (const [href, texte] of originaux) writeFileSync(new URL(href), texte);
}

const total = MUTATIONS.length;
console.log(`\nRatio de mutation : ${tuees}/${total} (${Math.round(100 * tuees / total)} %)`);
if (survivantes.length) {
  console.log('\nMUTATIONS SURVIVANTES — chacune est un trou dans les tests :');
  for (const s of survivantes) console.log('  · ' + s);
}
process.exit(survivantes.length ? 1 : 0);
