/* ============================================================================
   lecture/boutiques.mjs — ce que les boutiques affichent RÉELLEMENT.

   Les outils existent déjà et ont été durcis : `asc.py` sait signer un jeton
   ES256 et trouver sa clé, `play_api.py` connaît le piège des pistes Play. On
   les EXÉCUTE, on ne les réécrit pas.

   ⚠️ SEULES LES OPTIONS DE LECTURE SONT PERMISES, et la liste est en dur.
   `--listing`, `--upload`, `--promote`, `--sortie`, `--notes`, `--purger`
   écrivent chez Google : elles ne peuvent pas être atteintes depuis ici, même
   par erreur de frappe dans une URL.

   ⚠️ Une source injoignable rend `{etat:'non-lu', raison}`. Il n'existe AUCUN
   chemin qui produise une valeur par défaut : mieux vaut un écran qui dit
   « non lu » qu'un écran qui invente une fiche.
   ============================================================================ */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

const JEU = process.env.PD_BO_DEPOT_JEU || 'C:/Users/BureauDistant/piratesdice';
const PYTHON = process.env.PD_BO_PYTHON || 'python';

/** Les seuls arguments qu'on accepte de passer à play_api.py. */
const PLAY_LECTURE = ['--check', '--brut', '--historique', '--details'];

function executer(script, args, ms = 90000) {
  return new Promise((resolve) => {
    const chemin = `${JEU}/${script}`;
    if (!existsSync(chemin)) return resolve({ etat: 'non-lu', raison: `${script} introuvable dans ${JEU}` });
    execFile(PYTHON, [chemin, ...args], { cwd: JEU, timeout: ms, maxBuffer: 8 << 20 },
      (err, stdout, stderr) => {
        const sortie = (stdout || '').trim();
        if (err) {
          const raison = (stderr || '').trim().split('\n').pop() || err.message;
          return resolve({ etat: 'non-lu', raison, commande: `${script} ${args.join(' ')}` });
        }
        try { resolve({ etat: 'lu', donnees: JSON.parse(sortie), brut: sortie }); }
        catch { resolve({ etat: 'lu', donnees: null, brut: sortie }); }
      });
  });
}

/* -------------------------------------------------------------------- Apple */

export const apple = (chemin) => {
  if (!/^\/v1\/[A-Za-z0-9/?&=\[\]._-]*$/.test(chemin)) {
    return Promise.resolve({ etat: 'non-lu', raison: 'chemin App Store Connect refusé' });
  }
  return executer('asc.py', ['get', chemin]);
};

/**
 * La fiche Apple : titre, sous-titre, mots-clés, description, par langue.
 *
 * ⚠️ Le champ `keywords` (100 caractères par langue) n'est piloté par AUCUN
 * fichier du dépôt. C'est la seule façon de savoir ce qu'il contient.
 */
export async function ficheApple(bundle = 'com.nabil.piratesdice') {
  const app = await apple(`/v1/apps?filter[bundleId]=${bundle}`);
  if (app.etat !== 'lu' || !app.donnees?.data?.length) {
    return { etat: 'non-lu', raison: app.raison || `aucune app pour ${bundle}`, etape: 'recherche de l’app' };
  }
  const id = app.donnees.data[0].id;
  const versions = await apple(`/v1/apps/${id}/appStoreVersions?limit=5`);
  if (versions.etat !== 'lu') return { ...versions, etape: 'liste des versions' };

  const fiches = [];
  for (const v of versions.donnees.data || []) {
    const loc = await apple(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
    fiches.push({
      version: v.attributes?.versionString,
      etat: v.attributes?.appStoreState,
      langues: loc.etat === 'lu'
        ? (loc.donnees.data || []).map((l) => ({
            langue: l.attributes?.locale,
            description: l.attributes?.description,
            motsCles: l.attributes?.keywords,
            nouveautes: l.attributes?.whatsNew,
            urlSupport: l.attributes?.supportUrl,
          }))
        : { etat: 'non-lu', raison: loc.raison },
    });
  }
  return { etat: 'lu', appId: id, versions: fiches };
}

/* ------------------------------------------------------------------- Google */

export function google(option = '--check') {
  if (!PLAY_LECTURE.includes(option)) {
    return Promise.resolve({ etat: 'non-lu', raison: `option « ${option} » refusée : lecture seule` });
  }
  return executer('play_api.py', [option]);
}

export const optionsGoogle = () => [...PLAY_LECTURE];
