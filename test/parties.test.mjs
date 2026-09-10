import test from 'node:test';
import assert from 'node:assert/strict';
import {
  repartition, tauxAbandon, serieParJour, rupture, decoupage,
  trancheDuree, trancheEcart, duree, estAbandon, jourDe,
} from '../src/calcul/parties.mjs';

/* Fabrique une ligne de partie. Aucune base n'est touchée. */
const partie = (o = {}) => ({
  id: 1, mode: 'solo', ended_reason: 'normal',
  started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:02:00Z',
  score1: 100, score2: 80, p1_id: 7, p2_id: null,
  capitaine_p1: 'ching', capitaine_p2: 'lionne', ...o,
});

const beaucoup = (n, o) => Array.from({ length: n }, (_, i) => partie({ id: i + 1, ...o }));

/* ------------------------------------------------------------- estAbandon */

test('`complete` est une fin aboutie, pas un abandon', () => {
  assert.equal(estAbandon(partie({ ended_reason: 'complete' })), false);
  assert.equal(estAbandon(partie({ ended_reason: 'normal' })), false);
  assert.equal(estAbandon(partie({ ended_reason: 'quit' })), true);
  assert.equal(estAbandon(partie({ ended_reason: 'away' })), true);
  assert.equal(estAbandon(partie({ ended_reason: 'disconnect' })), true);
});

/* ------------------------------------------------------------ repartition */

test('repartition compte, calcule le pourcentage, et trie par fréquence', () => {
  const r = repartition([
    ...beaucoup(3, { ended_reason: 'quit' }),
    ...beaucoup(1, { ended_reason: 'normal' }),
  ]);
  assert.deepEqual(r, [
    { raison: 'quit', n: 3, pct: 75 },
    { raison: 'normal', n: 1, pct: 25 },
  ]);
});

test('repartition sur zéro ligne rend un tableau vide, pas une division par zéro', () => {
  assert.deepEqual(repartition([]), []);
});

/* ----------------------------------------------------------- tauxAbandon */

test('tauxAbandon rend null sur zéro partie — surtout pas 0', () => {
  // 0 % voudrait dire « aucun abandon », ce qui est une affirmation.
  // Sans partie, on ne sait rien : c'est `null` qui le dit.
  assert.equal(tauxAbandon([]), null);
});

test('tauxAbandon ne compte pas `complete` comme un abandon', () => {
  const lignes = [
    ...beaucoup(1, { ended_reason: 'quit' }),
    ...beaucoup(1, { ended_reason: 'complete' }),
  ];
  assert.equal(tauxAbandon(lignes), 50);
});

/* ---------------------------------------------------------- serieParJour */

test('serieParJour regroupe par jour, trie, et garde le détail par raison', () => {
  const s = serieParJour([
    partie({ ended_at: '2026-09-02T08:00:00Z', ended_reason: 'quit' }),
    partie({ ended_at: '2026-09-01T23:00:00Z', ended_reason: 'normal' }),
    partie({ ended_at: '2026-09-01T09:00:00Z', ended_reason: 'quit' }),
  ]);
  assert.deepEqual(s.map((e) => e.jour), ['2026-09-01', '2026-09-02']);
  assert.deepEqual(s[0], {
    jour: '2026-09-01', total: 2, abandons: 1, pct: 50,
    raisons: { normal: 1, quit: 1 },
  });
});

test('jourDe découpe en UTC, sans décalage local', () => {
  assert.equal(jourDe('2026-09-01T23:30:00Z'), '2026-09-01');
});

/* --------------------------------------------------------------- rupture */

test('rupture trouve le jour où le niveau change', () => {
  const serie = [
    ...['01', '02', '03', '04'].map((j) => ({ jour: `2026-09-${j}`, total: 100, abandons: 20 })),
    ...['05', '06', '07', '08'].map((j) => ({ jour: `2026-09-${j}`, total: 100, abandons: 80 })),
  ];
  const r = rupture(serie);
  assert.equal(r.jour, '2026-09-05');
  assert.equal(r.avant, 20);
  assert.equal(r.apres, 80);
  assert.equal(r.ecart, 60);
});

test('rupture rend null si la série est trop courte pour conclure', () => {
  const serie = [{ jour: '2026-09-01', total: 10, abandons: 5 }];
  assert.equal(rupture(serie), null);
});

test('rupture ne s’appuie jamais sur une extrémité de la série', () => {
  // Six jours stables, puis un dernier jour à 100 %. Sans protection des bords,
  // la coupure tombe sur ce dernier jour et annonce une rupture de 80 points
  // sur la foi d'UN SEUL point. Une rupture ainsi trouvée est indiscernable
  // d'un jour qui vient à peine de commencer.
  const serie = [
    ...['01', '02', '03', '04', '05', '06'].map((j) => ({ jour: `2026-09-${j}`, total: 100, abandons: 20 })),
    { jour: '2026-09-07', total: 100, abandons: 100 },
  ];
  // ⚠️ Pas de `minParCote` explicite ici : passer la valeur, c'est écraser
  // celle qu'on prétend éprouver. La première version de ce test le faisait,
  // et la mutation qui met la protection à zéro y survivait tranquillement.
  const r = rupture(serie);
  const i = serie.findIndex((e) => e.jour === r.jour);
  assert.ok(i >= 3 && serie.length - i >= 3,
    `coupure annoncée le ${r.jour} : ${i} jour(s) avant, ${serie.length - i} après`);
});

test('rupture pondère par le nombre de parties : un jour creux ne décide pas', () => {
  // Un seul jour à 3 parties, toutes abandonnées, au milieu d'un régime stable.
  // Non pondérée, la moyenne des taux le laisserait peser autant qu'un jour
  // à 300 parties, et la rupture serait fausse.
  const serie = [
    { jour: '2026-09-01', total: 300, abandons: 60 },
    { jour: '2026-09-02', total: 300, abandons: 60 },
    { jour: '2026-09-03', total: 300, abandons: 60 },
    { jour: '2026-09-04', total: 3, abandons: 3 },
    { jour: '2026-09-05', total: 300, abandons: 60 },
    { jour: '2026-09-06', total: 300, abandons: 60 },
  ];
  const r = rupture(serie);
  assert.ok(r.ecart < 2, `écart trouvé ${r.ecart} — un jour à 3 parties a fait basculer la mesure`);
});

/* ------------------------------------------------------------- decoupage */

test('decoupage écarte les groupes trop petits au lieu de les classer', () => {
  const lignes = [
    ...beaucoup(25, { capitaine_p1: 'ching', ended_reason: 'quit' }),
    ...beaucoup(2, { capitaine_p1: 'kidd', ended_reason: 'quit' }),
  ];
  const d = decoupage(lignes, (l) => l.capitaine_p1, { minimum: 20 });
  assert.deepEqual(d.groupes.map((g) => g.valeur), ['ching']);
  assert.deepEqual(d.sousLeSeuil.map((g) => g.valeur), ['kidd']);
  // kidd est à 100 % : sans le seuil, il serait en tête d'un classement par taux.
  assert.equal(d.sousLeSeuil[0].pct, 100);
});

test('decoupage ignore les lignes dont la clé est absente', () => {
  const lignes = [
    ...beaucoup(20, { capitaine_p1: 'ching' }),
    ...beaucoup(5, { capitaine_p1: null }),
  ];
  const d = decoupage(lignes, (l) => l.capitaine_p1, { minimum: 1 });
  assert.equal(d.groupes.length, 1);
  assert.equal(d.groupes[0].n, 20);
});

/* --------------------------------------------------------------- tranches */

test('duree rend les secondes, et null sur une date illisible', () => {
  assert.equal(duree(partie()), 120);
  assert.equal(duree(partie({ ended_at: 'pas une date' })), null);
});

test('trancheDuree place les bornes du bon côté', () => {
  const a = (s) => trancheDuree(partie({
    started_at: '2026-09-01T10:00:00Z',
    ended_at: new Date(Date.parse('2026-09-01T10:00:00Z') + s * 1000).toISOString(),
  }));
  assert.equal(a(9), 'moins de 10 s');
  assert.equal(a(10), '10 à 30 s');   // 10 s n'est PAS « moins de 10 s »
  assert.equal(a(30), '30 à 60 s');
  assert.equal(a(600), 'plus de 3 min');
});

test('trancheEcart distingue l’égalité du petit écart', () => {
  assert.equal(trancheEcart(partie({ score1: 50, score2: 50 })), 'égalité');
  assert.equal(trancheEcart(partie({ score1: 50, score2: 49 })), '1 à 10');
  assert.equal(trancheEcart(partie({ score1: 0, score2: 100 })), 'plus de 60');
});
