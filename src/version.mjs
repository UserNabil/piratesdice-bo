/* ============================================================================
   version.mjs — « quel code tourne ? », répondable en deux secondes.

   Le SHA est LU AU DÉMARRAGE par git, jamais écrit à la main : un numéro qu'on
   recopie est un numéro qui ment tôt ou tard. Si l'arbre est sale, le tampon
   porte `+sale` — une version qui ne correspond à aucun commit doit se
   dénoncer elle-même plutôt que de se faire passer pour lui.
   ============================================================================ */
import { execFileSync } from 'node:child_process';

const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

const sha = git('rev-parse', 'HEAD');
const sale = git('status', '--porcelain') !== '';

export const VERSION = Object.freeze({
  service: 'pd-bo',
  sha: sha || 'inconnu',
  court: (sha ? sha.slice(0, 7) : 'inconnu') + (sale ? '+sale' : ''),
  branche: git('rev-parse', '--abbrev-ref', 'HEAD') || 'inconnu',
  date: git('log', '-1', '--format=%cI') || null,
  sale,
  demarre: new Date().toISOString(),
});

/** Le tampon affiché en bas de chaque écran. */
export const tampon = () =>
  `${VERSION.service} ${VERSION.court} · démarré ${VERSION.demarre.slice(11, 16)} UTC`;
