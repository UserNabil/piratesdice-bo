/* ============================================================================
   vues/ecrans.mjs — les quatre écrans. Aucun calcul ici : tout vient de
   `calcul/parties.mjs`, qui est testé sans base.
   ============================================================================ */
import { page, esc, nonLu, carte, tableau, barreRepartition, legende } from './page.mjs';
import * as R from '../lecture/requetes.mjs';
import * as Jeu from '../lecture/jeu.mjs';
import * as Boutiques from '../lecture/boutiques.mjs';
import * as base from '../lecture/base.mjs';
import {
  repartition, tauxAbandon, serieParJour, rupture, decoupage,
  trancheDuree, trancheEcart, estAbandon, arrondi,
} from '../calcul/parties.mjs';

const pct = (x) => x === null ? '—' : `${x} %`;
const heure = (t) => t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : '—';

/* ═══════════════════════════════════════════════════════════ ① ÉTAT ═══════ */

export async function ecranEtat() {
  const [v, s, db] = await Promise.all([Jeu.version(), Jeu.sante(), base.sante()]);
  let c = null, cErr = null, hier = [];
  try { [c, hier] = await Promise.all([R.compteurs(), R.abandonsHierEtAujourdhui()]); }
  catch (e) { cErr = e.message; }

  const jour = (d) => hier.find((h) => String(h.jour).slice(0, 10) === d);
  const auj = jour(new Date().toISOString().slice(0, 10));
  const av = hier.find((h) => h !== auj);
  const taux = (h) => h && h.total ? arrondi(100 * h.abandons / h.total) : null;

  let corps = '<h2>Le serveur de jeu</h2>';
  if (v.etat !== 'lu') {
    corps += nonLu(`/version sur ${Jeu.adresse()}`, v.raison);
  } else {
    corps += `<div class="grille">
      ${carte('Version en ligne', v.donnees.court, `sha ${esc(v.donnees.sha.slice(0, 12))} · ${esc(v.donnees.branche)}`)}
      ${carte('Déployée le', heure(v.donnees.date), esc(v.donnees.source || ''))}
      ${carte('En marche depuis', `${Math.floor((v.donnees.demarre || 0) / 3600)} h`, `${esc(v.donnees.service)} ${esc(v.donnees.paquet || '')}`)}
    </div>`;
  }

  corps += '<h2>Santé</h2>';
  if (s.etat !== 'lu') {
    corps += nonLu('/health', s.raison);
  } else {
    const d = s.donnees;
    const cls = s.baseDeDonnees === 'up' ? 'ok' : 'mal';
    corps += `<div class="grille">
      ${carte('Base de données', s.baseDeDonnees, '← le seul champ qui dise la vérité', cls)}
      ${carte('Champ « status »', s.statutAffiche, s.divergence
        ? '<span class="mal">⚠️ dit « ok » alors que la base est à terre</span>'
        : '<span class="doux">rend « ok » quoi qu’il arrive — à ne pas lire seul</span>',
        s.divergence ? 'mal' : 'doux')}
      ${carte('Clients connectés', d.clients ?? '—')}
      ${carte('Parties en cours', d.matches ?? '—', `file ${esc(String(d.queue ?? '—'))}`)}
    </div>`;
  }

  corps += '<h2>La base, vue d’ici</h2>';
  corps += db.etat !== 'lu'
    ? nonLu('PostgreSQL', db.raison)
    : `<div class="grille">${carte('Connexion', `${db.qui}`, `${db.ms} ms · lecture seule`, 'ok')}
       ${carte('Heure de la base', heure(db.maintenant))}</div>`;

  corps += '<h2>Ce que fait le jeu</h2>';
  if (cErr) corps += nonLu('compteurs', cErr);
  else if (c) {
    const delta = c.parties_hier ? arrondi(100 * (c.parties_aujourdhui - c.parties_hier) / c.parties_hier) : null;
    corps += `<div class="grille">
      ${carte('Joueurs', c.joueurs)}
      ${carte('Actifs sur 24 h', c.joueurs_actifs_24h, `${c.joueurs_actifs_7j} sur 7 jours`)}
      ${carte('Parties aujourd’hui', c.parties_aujourdhui,
        delta === null ? 'hier : aucune' :
        `hier ${c.parties_hier} · <span class="${delta >= 0 ? 'ok' : 'alerte'}">${delta >= 0 ? '+' : ''}${delta} %</span>`)}
      ${carte('Parties au total', c.parties, `dernière ${heure(c.derniere_partie)}`)}
      ${carte('Abandons aujourd’hui', pct(taux(auj)),
        av ? `hier ${pct(taux(av))}` : 'hier : aucune donnée',
        (taux(auj) ?? 0) > 80 ? 'mal' : 'alerte')}
    </div>`;
  }

  corps += `<h2>Dernières erreurs</h2>${nonLu(
    'journald du service eden-dice', 'aucune collecte branchée depuis le backoffice',
    'journalctl -u eden-dice — voir COLLECTE_ERREURS.md, chantier partagé avec le dépôt du jeu')}`;

  return page('État', '/', corps);
}

/* ════════════════════════════════════════════════════════ ② JOUEURS ═══════ */

export async function ecranJoueurs(url) {
  const recherche = url.searchParams.get('q') || '';
  let corps = `<form method="get"><input name="q" placeholder="nom ou identifiant"
    value="${esc(recherche)}" size="28"><button>Chercher</button></form>`;
  try {
    const lignes = await R.joueurs({ recherche });
    corps += `<p class="note">${lignes.length} joueur(s). Seules les données utiles à
      l’administration sont affichées : ni secret d’appareil, ni identité de fournisseur.</p>`;
    corps += tableau(['id', 'nom', 'capitaine', 'classement', 'parties', 'pièces'],
      lignes.map((j) => [
        `<a class="lien" href="/joueurs/${j.id}">${j.id}</a>`,
        esc(j.display_name || '—'), esc(j.captain || '—'),
        j.rating ?? '—', j.parties ?? 0, j.basic_coins ?? 0,
      ]));
  } catch (e) { corps += nonLu('liste des joueurs', e.message); }
  return page('Joueurs', '/joueurs', corps);
}

export async function ecranJoueur(id) {
  let corps = '';
  try {
    const j = await R.joueur(id);
    if (!j) return page('Joueur', '/joueurs', '<p class="note">Aucun joueur avec cet identifiant.</p>');
    const [parties, succes, capitaines, campagne] = await Promise.all([
      R.partiesDuJoueur(id), R.succesDuJoueur(id), R.capitainesDuJoueur(id), R.campagneDuJoueur(id),
    ]);
    const rep = repartition(parties);
    corps += `<h2>${esc(j.display_name || '(sans nom)')} <span class="doux">#${j.id}</span></h2>
      <div class="grille">
        ${carte('Classement', j.rating ?? '—')}
        ${carte('Parties réglées', j.games ?? 0)}
        ${carte('Capitaine courant', esc(j.captain || '—'))}
        ${carte('Pièces', j.basic_coins ?? 0)}
        ${carte('Abandons (30 dernières)', pct(tauxAbandon(parties)))}
      </div>
      <h2>Dernières parties</h2>${barreRepartition(rep, parties.length)}
      <p class="note">${legende(rep)}</p>` +
      tableau(['fin', 'mode', 'raison', 'score', 'adversaire', 'classement'],
        parties.map((p) => [
          heure(p.ended_at), esc(p.mode),
          `<span class="${estAbandon(p) ? 'alerte' : 'ok'}">${esc(p.ended_reason)}</span>`,
          `${p.score1} – ${p.score2}`, esc(p.p2_name || '—'),
          p.rating1_before !== null ? `${p.rating1_before} → ${p.rating1_after}` : '—',
        ]));

    corps += `<h2>Capitaines</h2>` + tableau(['capitaine', 'xp', 'rang 2', 'rang 3', 'rang 4', 'mis à jour'],
      capitaines.map((c) => [esc(c.captain_id), c.xp, esc(c.rank2_choice || '—'),
        esc(c.rank3_choice || '—'), esc(c.rank4_choice || '—'), heure(c.updated_at)]));

    corps += `<h2>Campagne</h2>` + tableau(['niveau', 'étoiles (masque)'],
      campagne.map((c) => [esc(c.level_id), c.etoiles]));

    corps += `<h2>Hauts faits — ${succes.length}</h2>` + tableau(['succès', 'compteur', 'cible', 'réclamé'],
      succes.slice(0, 60).map((s) => [esc(s.identify), esc(s.tally || '—'), s.cible ?? '—',
        s.claimed_at ? heure(s.claimed_at) : '<span class="alerte">non réclamé</span>']));
  } catch (e) { corps += nonLu('fiche du joueur', e.message); }
  return page('Joueur', '/joueurs', corps);
}

/* ════════════════════════════════════════════════════════ ③ PARTIES ═══════ */

export async function ecranParties(url) {
  const jours = Number(url.searchParams.get('jours') || 30);
  const mode = url.searchParams.get('mode') || 'tous';
  let corps = `<form method="get">
    <select name="jours">${[7, 14, 30, 90, 365].map((j) =>
      `<option value="${j}"${j === jours ? ' selected' : ''}>${j} jours</option>`).join('')}</select>
    <select name="mode">${R.modesConnus().map((m) =>
      `<option value="${m}"${m === mode ? ' selected' : ''}>${m}</option>`).join('')}</select>
    <button>Voir</button></form>`;
  try {
    const lignes = await R.parties({ jours, mode });
    if (!lignes.length) return page('Parties', '/parties', corps + '<p class="note">Aucune partie sur la fenêtre.</p>');

    const rep = repartition(lignes);
    const serie = serieParJour(lignes);
    const r = rupture(serie);

    corps += `<div class="grille">
      ${carte('Parties', lignes.length, `sur ${jours} jours · mode ${esc(mode)}`)}
      ${carte('Fins anormales', pct(tauxAbandon(lignes)), 'tout sauf normal et complete',
        (tauxAbandon(lignes) ?? 0) > 70 ? 'mal' : 'alerte')}
      ${carte('Avec journal de partie', `${lignes.filter((l) => l.a_journal).length}`,
        'le capitaine n’est lisible que là')}
    </div>
    <h2>Répartition</h2>${barreRepartition(rep, lignes.length)}<p class="note">${legende(rep)}</p>`;

    /* La rupture d'abord : c'est la seule forme qui distingue un défaut mis en
       production d'un comportement normal de joueurs sur mobile. */
    corps += '<h2>Y a-t-il eu une rupture ?</h2>';
    if (!r) {
      corps += '<p class="note">Série trop courte pour conclure : il faut au moins six jours.</p>';
    } else {
      corps += `<div class="grille">
        ${carte('Coupure la plus nette', r.jour, `${r.partiesAvant} parties avant, ${r.partiesApres} après`)}
        ${carte('Avant', `${r.avant} %`)}
        ${carte('Après', `${r.apres} %`, '', r.apres > r.avant ? 'mal' : 'ok')}
        ${carte('Écart', `${r.ecart} pts`, '', r.ecart > 10 ? 'mal' : 'doux')}
      </div>
      <p class="note">⚠️ Un écart de niveau n’est pas encore un défaut. Avant de
      conclure, regarde le <b>mélange</b> ci-dessous : si une raison a remplacé une
      autre à taux total constant, c’est la <b>mesure</b> qui a changé — une raison
      qu’on s’est mis à enregistrer — et non le comportement des joueurs.</p>`;
    }

    corps += '<h2>Jour par jour — total, et mélange</h2>';
    const raisons = [...new Set(lignes.map((l) => l.ended_reason))].sort();
    corps += tableau(['jour', 'parties', 'anormales', 'taux', 'mélange', ...raisons],
      serie.map((e) => [
        e.jour, e.total, e.abandons,
        `<span class="${e.pct > 80 ? 'mal' : e.pct > 50 ? 'alerte' : 'ok'}">${e.pct} %</span>`,
        barreRepartition(repartition(lignes.filter((l) => l.ended_at && String(l.ended_at.toISOString?.() ?? l.ended_at).slice(0, 10) === e.jour)), e.total),
        ...raisons.map((x) => e.raisons[x] ?? ''),
      ]));

    for (const [titre, cle, note] of [
      ['Par mode', (l) => l.mode, ''],
      ['Par moment de l’abandon', trancheDuree, 'durée entre le début et la fin de la partie'],
      ['Par écart de score', trancheEcart, 'écart au moment où la partie s’arrête'],
      ['Par capitaine du joueur', (l) => l.capitaine_p1,
       'lu dans le journal de partie — les parties sans journal sont absentes'],
    ]) {
      const d = decoupage(lignes, cle);
      corps += `<h2>${titre}</h2>${note ? `<p class="note">${note}</p>` : ''}` +
        tableau(['valeur', 'parties', 'anormales', 'taux', 'mélange'],
          d.groupes.map((g) => [esc(g.valeur), g.n, g.abandons,
            `<span class="${g.pct > 80 ? 'mal' : 'alerte'}">${g.pct} %</span>`,
            barreRepartition(g.repartition, g.n)]));
      if (d.sousLeSeuil.length) {
        corps += `<p class="note">${d.sousLeSeuil.length} groupe(s) sous ${d.minimum} parties,
          écartés du classement parce qu’un groupe de deux parties toutes abandonnées
          affiche 100 % et se placerait en tête : ${
          esc(d.sousLeSeuil.map((g) => `${g.valeur} (${g.n})`).join(', '))}</p>`;
      }
    }
  } catch (e) { corps += nonLu('parties', e.message); }
  return page('Parties', '/parties', corps);
}

/* ═══════════════════════════════════════════════════════ ④ BOUTIQUES ══════ */

export async function ecranBoutiques() {
  let corps = `<p class="note">Lecture seule. Le backoffice exécute <code>asc.py</code> et
    <code>play_api.py</code> — il ne les réécrit pas, et seules leurs options de lecture
    sont atteignables.</p><h2>Apple — App Store</h2>`;

  const a = await Boutiques.ficheApple();
  if (a.etat !== 'lu') {
    corps += nonLu('fiche App Store', a.raison, a.etape ? `étape : ${a.etape}` : '');
  } else {
    for (const v of a.versions) {
      corps += `<h2>Version ${esc(v.version)} — ${esc(v.etat)}</h2>`;
      if (!Array.isArray(v.langues)) { corps += nonLu('localisations', v.langues.raison); continue; }
      corps += tableau(['langue', 'mots-clés (100 car.)', 'longueur', 'description', 'nouveautés'],
        v.langues.map((l) => [
          esc(l.langue),
          l.motsCles ? `<code>${esc(l.motsCles)}</code>` : '<span class="alerte">vide</span>',
          `<span class="${(l.motsCles || '').length > 100 ? 'mal' : 'doux'}">${(l.motsCles || '').length}</span>`,
          esc((l.description || '').slice(0, 160)) + ((l.description || '').length > 160 ? '…' : ''),
          esc((l.nouveautes || '').slice(0, 80)),
        ]));
    }
  }

  corps += '<h2>Google Play</h2>';
  const g = await Boutiques.google('--check');
  corps += g.etat !== 'lu'
    ? nonLu('pistes Google Play', g.raison, g.commande || '')
    : `<div class="enveloppe"><pre class="carte">${esc(g.brut)}</pre></div>`;

  return page('Boutiques', '/boutiques', corps);
}
