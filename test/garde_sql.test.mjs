import test from 'node:test';
import assert from 'node:assert/strict';
import { estLecture, listeBlanche } from '../src/lecture/base.mjs';

test('estLecture accepte SELECT et WITH', () => {
  assert.equal(estLecture('SELECT 1'), true);
  assert.equal(estLecture('  \n select * from match'), true);
  assert.equal(estLecture('WITH x AS (SELECT 1) SELECT * FROM x'), true);
});

test('estLecture refuse tout ce qui écrit', () => {
  for (const sql of [
    'INSERT INTO match VALUES (1)',
    'UPDATE player SET rating = 0',
    'DELETE FROM match',
    'DROP TABLE match',
    'TRUNCATE match',
    'CREATE TABLE x (i int)',
    'ALTER TABLE match ADD COLUMN x int',
    'GRANT ALL ON match TO public',
  ]) assert.equal(estLecture(sql), false, sql);
});

test('estLecture accepte une vraie lecture précédée d’un commentaire', () => {
  // Nos propres requêtes sont commentées. Une garde qui les refuse est une
  // garde qu'on finira par contourner — et une garde contournée ne garde rien.
  assert.equal(estLecture('/* écran ③ — répartition */ SELECT 1'), true);
  assert.equal(estLecture('-- écran ③\nSELECT 1'), true);
});

test('estLecture n’est pas dupée par un commentaire de tête', () => {
  // Un refus qui se contente de regarder le premier caractère laisse passer ça.
  assert.equal(estLecture('/* SELECT */ DELETE FROM match'), false);
  assert.equal(estLecture('-- SELECT\nDELETE FROM match'), false);
});

test('estLecture refuse une seconde instruction accolée', () => {
  // Le vrai danger d'un `lire()` trop confiant : la lecture est vraie, et
  // l'écriture voyage derrière le point-virgule.
  assert.equal(estLecture('SELECT 1; DROP TABLE match'), false);
});

test('estLecture tolère un point-virgule final seul', () => {
  assert.equal(estLecture('SELECT 1;'), true);
  assert.equal(estLecture('SELECT 1;  \n'), true);
});

test('listeBlanche rend le défaut pour toute valeur non prévue', () => {
  const cols = ['ended_at', 'id'];
  assert.equal(listeBlanche('id', cols, 'ended_at'), 'id');
  assert.equal(listeBlanche('rating; DROP TABLE match', cols, 'ended_at'), 'ended_at');
  assert.equal(listeBlanche(undefined, cols, 'ended_at'), 'ended_at');
});
