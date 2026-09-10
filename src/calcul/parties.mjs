/* ============================================================================
   calcul/parties.mjs — tout ce qui transforme des lignes en chiffres.

   Ce module ne connaît NI la base NI HTTP. Il prend des lignes, il rend des
   nombres. C'est ce qui le rend testable sans base (étape 4), et c'est aussi
   ce qui fera qu'il ne bougera pas quand les actions arriveront.

   Une ligne de partie, telle que la base la rend :
     { id, mode, ended_reason, started_at, ended_at, score1, score2,
       p1_id, p2_id, capitaine_p1, capitaine_p2 }
   ============================================================================ */

/** La seule fin qui n'est pas un abandon. Tout le reste l'est. */
export const FIN_NORMALE = 'normal';

/* ⚠️ `complete` existe en base (2 lignes) et n'est PAS `normal`. Le compter
   comme un abandon serait faux ; l'oublier aussi. Il est donc nommé ici, et
   traité comme une fin aboutie — mais il reste visible dans la répartition. */
export const FINS_ABOUTIES = new Set([FIN_NORMALE, 'complete']);

export const estAbandon = (ligne) => !FINS_ABOUTIES.has(ligne.ended_reason);

/** Durée en secondes, ou null si l'une des deux bornes manque. */
export function duree(ligne) {
  const d = new Date(ligne.started_at), f = new Date(ligne.ended_at);
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return null;
  return (f.getTime() - d.getTime()) / 1000;
}

/* ---------------------------------------------------------------- répartition */

/**
 * Compte les parties par raison de fin.
 * Rend un tableau trié du plus fréquent au moins fréquent, avec le pourcentage.
 */
export function repartition(lignes) {
  const par = new Map();
  for (const l of lignes) par.set(l.ended_reason, (par.get(l.ended_reason) || 0) + 1);
  const total = lignes.length;
  return [...par.entries()]
    .map(([raison, n]) => ({ raison, n, pct: total ? arrondi(100 * n / total) : 0 }))
    .sort((a, b) => b.n - a.n || a.raison.localeCompare(b.raison));
}

/** Part des abandons, en pourcentage. `null` si aucune partie — pas 0. */
export function tauxAbandon(lignes) {
  if (!lignes.length) return null;
  return arrondi(100 * lignes.filter(estAbandon).length / lignes.length);
}

/* -------------------------------------------------------------- dans le temps */

/** Clé de jour (UTC) `AAAA-MM-JJ` pour un horodatage. */
export const jourDe = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Série par jour : total, abandons, taux, et le DÉTAIL par raison.
 *
 * ⚠️ Le détail n'est pas un ornement. Le taux global peut rester stable pendant
 * que le mélange bascule d'une raison à l'autre — et un basculement de mélange
 * est le signe d'un changement de MESURE (une raison qu'on s'est mis à
 * enregistrer), pas d'un changement de comportement des joueurs. Sans le
 * détail, on confond les deux, et on cherche un défaut là où il n'y en a pas.
 */
export function serieParJour(lignes) {
  const par = new Map();
  for (const l of lignes) {
    const j = jourDe(l.ended_at);
    if (!par.has(j)) par.set(j, { jour: j, total: 0, abandons: 0, raisons: {} });
    const e = par.get(j);
    e.total += 1;
    if (estAbandon(l)) e.abandons += 1;
    e.raisons[l.ended_reason] = (e.raisons[l.ended_reason] || 0) + 1;
  }
  return [...par.values()]
    .sort((a, b) => a.jour.localeCompare(b.jour))
    .map((e) => ({ ...e, pct: arrondi(100 * e.abandons / e.total) }));
}

/**
 * Cherche la plus forte rupture de niveau dans une série.
 *
 * Méthode : pour chaque coupure possible, on compare la moyenne PONDÉRÉE PAR LE
 * NOMBRE DE PARTIES avant et après. Pondérer est ce qui empêche un jour à trois
 * parties de peser autant qu'un jour à quatre cents.
 *
 * `minParCote` protège des coupures aux extrémités, où « avant » ne contient
 * qu'un point : sans lui, la fonction trouve toujours une rupture, même dans du
 * bruit pur.
 *
 * Rend `null` si la série est trop courte — pas une rupture de zéro.
 */
export function rupture(serie, { minParCote = 3, champ = 'abandons' } = {}) {
  if (serie.length < minParCote * 2) return null;
  let meilleure = null;
  for (let i = minParCote; i <= serie.length - minParCote; i += 1) {
    const avant = serie.slice(0, i), apres = serie.slice(i);
    const ta = tauxPondere(avant, champ), tp = tauxPondere(apres, champ);
    if (ta === null || tp === null) continue;
    const ecart = Math.abs(tp - ta);
    if (!meilleure || ecart > meilleure.ecart) {
      meilleure = { jour: serie[i].jour, avant: ta, apres: tp, ecart: arrondi(ecart),
                    partiesAvant: somme(avant), partiesApres: somme(apres) };
    }
  }
  return meilleure;
}

const somme = (s) => s.reduce((n, e) => n + e.total, 0);

function tauxPondere(serie, champ) {
  const total = somme(serie);
  if (!total) return null;
  return arrondi(100 * serie.reduce((n, e) => n + (e[champ] || 0), 0) / total);
}

/* ------------------------------------------------------------------ découpages */

/**
 * Découpe les parties selon une clé, et rend le taux d'abandon de chaque groupe.
 *
 * ⚠️ `minimum` existe pour une raison : un capitaine joué deux fois dont les
 * deux parties sont abandonnées affiche 100 %, et se placerait en tête d'un
 * classement par taux. Les groupes sous le seuil sont rendus à part plutôt que
 * mélangés aux autres — les cacher serait mentir, les classer avec les autres
 * serait pire.
 */
export function decoupage(lignes, cle, { minimum = 20 } = {}) {
  const par = new Map();
  for (const l of lignes) {
    const k = cle(l);
    if (k === null || k === undefined) continue;
    if (!par.has(k)) par.set(k, []);
    par.get(k).push(l);
  }
  const groupes = [...par.entries()].map(([valeur, ls]) => ({
    valeur, n: ls.length, abandons: ls.filter(estAbandon).length,
    pct: arrondi(100 * ls.filter(estAbandon).length / ls.length),
    repartition: repartition(ls),
  }));
  return {
    groupes: groupes.filter((g) => g.n >= minimum).sort((a, b) => b.n - a.n),
    sousLeSeuil: groupes.filter((g) => g.n < minimum).sort((a, b) => b.n - a.n),
    minimum,
  };
}

/** Tranches de durée, pour « à quel moment ils partent ». */
export const TRANCHES = [
  { max: 10, nom: 'moins de 10 s' },
  { max: 30, nom: '10 à 30 s' },
  { max: 60, nom: '30 à 60 s' },
  { max: 180, nom: '1 à 3 min' },
  { max: Infinity, nom: 'plus de 3 min' },
];

export function trancheDuree(ligne) {
  const d = duree(ligne);
  if (d === null || d < 0) return null;
  return TRANCHES.find((t) => d < t.max).nom;
}

/** Tranches d'écart de score au moment de la fin. */
export function trancheEcart(ligne) {
  const e = Math.abs((ligne.score1 ?? 0) - (ligne.score2 ?? 0));
  if (e === 0) return 'égalité';
  if (e <= 10) return '1 à 10';
  if (e <= 30) return '11 à 30';
  if (e <= 60) return '31 à 60';
  return 'plus de 60';
}

/* ------------------------------------------------------------------------ util */

/** Un chiffre après la virgule, et un vrai nombre — pas une chaîne. */
export const arrondi = (x) => Math.round(x * 10) / 10;
