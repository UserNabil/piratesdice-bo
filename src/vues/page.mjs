/* ============================================================================
   vues/page.mjs — le gabarit, et rien d'autre.

   HTML rendu côté serveur, sans étape de build : on ouvre le fichier, on voit
   la page. Le tampon de version est en bas de CHAQUE écran — c'est ce qui rend
   « quel code tourne » répondable sans chercher.
   ============================================================================ */
import { tampon, VERSION } from '../version.mjs';

/** Échappe TOUT, apostrophe comprise. L'audit du jeu a trouvé un `esc()` qui
    l'oubliait : ici les noms de joueurs sont saisis par des inconnus. */
export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ONGLETS = [
  ['/', 'État'], ['/joueurs', 'Joueurs'], ['/parties', 'Parties'], ['/boutiques', 'Boutiques'],
];

export function page(titre, actif, corps) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titre)} — pd-bo</title><style>
:root{--fond:#241C33;--carte:#2f2542;--trait:#463a5e;--texte:#efe9f7;--doux:#a99cc0;
--ok:#5fd08a;--alerte:#ffb454;--mal:#ff6b6b;--accent:#c9a227}
*{box-sizing:border-box}body{margin:0;background:var(--fond);color:var(--texte);
font:14px/1.5 system-ui,Segoe UI,sans-serif}
header{display:flex;gap:4px;align-items:center;padding:10px 16px;background:#1b1528;
border-bottom:1px solid var(--trait);flex-wrap:wrap}
header b{color:var(--accent);margin-right:12px;letter-spacing:.5px}
header a{color:var(--doux);text-decoration:none;padding:6px 12px;border-radius:6px}
header a:hover{background:var(--carte);color:var(--texte)}
header a.actif{background:var(--carte);color:var(--texte);box-shadow:inset 0 -2px 0 var(--accent)}
main{padding:16px;max-width:1180px;margin:0 auto}
h2{font-size:15px;margin:22px 0 10px;color:var(--doux);text-transform:uppercase;
letter-spacing:.08em;font-weight:600}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.carte{background:var(--carte);border:1px solid var(--trait);border-radius:10px;padding:14px}
.carte .v{font-size:26px;font-weight:600;margin-top:2px}
.carte .l{color:var(--doux);font-size:12px}
.carte .n{color:var(--doux);font-size:12px;margin-top:6px}
table{width:100%;border-collapse:collapse;background:var(--carte);
border:1px solid var(--trait);border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--trait);font-variant-numeric:tabular-nums}
th{color:var(--doux);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
tr:last-child td{border-bottom:0}
tr:hover td{background:#372c4d}
.enveloppe{overflow-x:auto}
a.lien{color:var(--accent)}
.ok{color:var(--ok)}.alerte{color:var(--alerte)}.mal{color:var(--mal)}.doux{color:var(--doux)}
.nonlu{background:#3a2a2a;border:1px solid #6b4444;border-radius:10px;padding:14px;margin:10px 0}
.nonlu b{color:var(--alerte)}
.nonlu code{color:var(--doux);font-size:12px;word-break:break-all}
.barre{height:9px;border-radius:5px;background:#1b1528;overflow:hidden;display:flex;min-width:120px}
.barre i{display:block;height:100%}
form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
input,select{background:var(--carte);border:1px solid var(--trait);color:var(--texte);
padding:7px 10px;border-radius:6px;font:inherit}
button{background:var(--accent);border:0;color:#241C33;padding:7px 14px;border-radius:6px;
font:inherit;font-weight:600;cursor:pointer}
footer{color:var(--doux);font-size:12px;padding:22px 16px;text-align:center;
border-top:1px solid var(--trait);margin-top:32px}
footer code{color:var(--accent)}
.note{color:var(--doux);font-size:12px;margin:6px 0 12px}
</style></head><body>
<header><b>PD·BO</b>${ONGLETS.map(([u, n]) =>
  `<a href="${u}" class="${u === actif ? 'actif' : ''}">${n}</a>`).join('')}</header>
<main>${corps}</main>
<footer><code>${esc(tampon())}</code> · branche ${esc(VERSION.branche)}${
  VERSION.sale ? ' · <span class="alerte">arbre sale : ce qui tourne n’est aucun commit</span>' : ''
} · lecture seule</footer></body></html>`;
}

/** Le bloc « non lu » — un état affiché, jamais une valeur inventée. */
export const nonLu = (quoi, raison, detail = '') => `<div class="nonlu">
<b>${esc(quoi)} — non lu.</b><br><span class="doux">${esc(raison)}</span>
${detail ? `<br><code>${esc(detail)}</code>` : ''}</div>`;

export const carte = (libelle, valeur, note = '', classe = '') =>
  `<div class="carte"><div class="l">${esc(libelle)}</div>
<div class="v ${classe}">${esc(valeur)}</div>
${note ? `<div class="n">${note}</div>` : ''}</div>`;

export function tableau(colonnes, lignes) {
  if (!lignes.length) return '<p class="note">Aucune ligne.</p>';
  return `<div class="enveloppe"><table><tr>${
    colonnes.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${
    lignes.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

const COULEURS = {
  normal: '#5fd08a', complete: '#3fa5c9', quit: '#ff6b6b',
  disconnect: '#ffb454', away: '#c07be0',
};

/** Barre empilée d'une répartition — la seule « figure » de l'outil. */
export const barreRepartition = (rep, total) => !total ? '' : `<div class="barre">${
  rep.map((r) => `<i style="width:${(100 * r.n / total).toFixed(2)}%;background:${
    COULEURS[r.raison] || '#7a6b96'}" title="${esc(r.raison)} ${r.n}"></i>`).join('')}</div>`;

export const legende = (rep) => rep.map((r) =>
  `<span class="doux" style="margin-right:12px"><i style="display:inline-block;width:9px;height:9px;
border-radius:2px;background:${COULEURS[r.raison] || '#7a6b96'};margin-right:4px"></i>${
  esc(r.raison)} ${r.n} (${r.pct} %)</span>`).join('');
