/* ============================================================================
   serveur.mjs — le seul point d'entrée.

   ⚠️ `127.0.0.1` est ÉCRIT EN DUR, et le port est la seule chose réglable.
   Une variable d'environnement qui peut valoir `0.0.0.0` est une exposition
   qui attend une faute de frappe : ici, il n'y a pas de faute de frappe
   possible.

   ⚠️ SEUL `GET` est routé. Toute autre méthode rend 405 AVANT tout routage.
   Le jour où une action d'écriture arrivera, elle demandera d'ouvrir `POST`
   pour elle seule — et la revue portera sur cette ligne-là, pas sur l'ensemble.
   ============================================================================ */
import http from 'node:http';
import { VERSION, tampon } from './version.mjs';
import { page, nonLu } from './vues/page.mjs';
import { ecranEtat, ecranJoueurs, ecranJoueur, ecranParties, ecranBoutiques } from './vues/ecrans.mjs';
import { fermer } from './lecture/base.mjs';

const PORT = Number(process.env.PD_BO_PORT || 8787);
const ADRESSE = '127.0.0.1';

const html = (res, code, corps) =>
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }).end(corps);

async function router(req, res) {
  if (req.method !== 'GET') {
    return res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain; charset=utf-8' })
      .end('405 — ce backoffice est en lecture seule : seul GET est routé.\n');
  }
  const url = new URL(req.url, `http://${ADRESSE}:${PORT}`);
  const chemin = url.pathname.replace(/\/+$/, '') || '/';

  if (chemin === '/version') {
    return res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      .end(JSON.stringify(VERSION));
  }
  if (chemin === '/') return html(res, 200, await ecranEtat());
  if (chemin === '/joueurs') return html(res, 200, await ecranJoueurs(url));
  const fiche = chemin.match(/^\/joueurs\/(\d+)$/);
  if (fiche) return html(res, 200, await ecranJoueur(Number(fiche[1])));
  if (chemin === '/parties') return html(res, 200, await ecranParties(url));
  if (chemin === '/boutiques') return html(res, 200, await ecranBoutiques());

  return html(res, 404, page('Introuvable', '', '<p class="note">Rien à cette adresse.</p>'));
}

const serveur = http.createServer((req, res) => {
  /* Le filet de dernier recours, comme `index.js` côté jeu : une promesse
     rejetée devient une page d'erreur, jamais un processus mort ni une
     requête suspendue. */
  router(req, res).catch((e) => {
    console.error('[bo]', req.method, req.url, '—', e.message);
    if (!res.headersSent) html(res, 500, page('Erreur', '', nonLu('cette page', e.message)));
    else res.end();
  });
});

serveur.listen(PORT, ADRESSE, () => {
  console.log(`\n  ${tampon()}`);
  console.log(`  http://${ADRESSE}:${PORT}   (lecture seule, jamais exposé)\n`);
  if (VERSION.sale) console.log('  ⚠️  arbre sale : ce qui tourne ne correspond à aucun commit.\n');
});

const arret = async () => {
  serveur.close();
  await fermer().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', arret);
process.on('SIGTERM', arret);
process.on('unhandledRejection', (e) => console.error('[bo] rejet non géré :', e?.message || e));
