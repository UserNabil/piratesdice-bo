/* ============================================================================
   lecture/jeu.mjs — ce que le serveur de jeu dit de lui-même.

   ⚠️ `/health` MENT : il rend `"status":"ok"` même base à terre. Le seul champ
   qui dit la vérité est `database`. On lit donc les deux, on affiche les deux,
   et c'est `database` qui décide de la couleur. Le jour où `status` se met à
   dire la vérité, l'écran le montrera sans qu'on ait à y toucher.
   ============================================================================ */
const BASE = process.env.PD_BO_JEU || 'http://192.168.1.19:8100';

async function json(chemin, ms = 6000) {
  const stop = new AbortController();
  const t = setTimeout(() => stop.abort(), ms);
  try {
    const r = await fetch(BASE + chemin, { signal: stop.signal });
    if (!r.ok) return { etat: 'non-lu', raison: `HTTP ${r.status}` };
    return { etat: 'lu', donnees: await r.json() };
  } catch (e) {
    return { etat: 'non-lu', raison: e.name === 'AbortError' ? `pas de réponse en ${ms} ms` : e.message };
  } finally { clearTimeout(t); }
}

export const adresse = () => BASE;
export const version = () => json('/version');

export async function sante() {
  const r = await json('/health');
  if (r.etat !== 'lu') return r;
  const d = r.donnees;
  return {
    etat: 'lu',
    donnees: d,
    /* La vérité, et la façade, séparées explicitement. */
    baseDeDonnees: d.database ?? 'champ absent',
    statutAffiche: d.status ?? 'champ absent',
    divergence: d.status === 'ok' && d.database !== 'up',
  };
}
