import test from 'node:test';
import assert from 'node:assert/strict';
import { assertConfirm, clampDepth, isMutating, matchesQuery, paintTarget, shouldCommit, textCharacters } from './policy.ts';

test('mutating methods commit once, and render can opt out', () => {
  assert.equal(isMutating('delete_nodes'), true);
  assert.equal(isMutating('get_metadata'), false);
  assert.equal(isMutating('undo'), false);
  assert.equal(shouldCommit('set_text_content', {}), true);
  assert.equal(shouldCommit('render_design', {}), true);
  assert.equal(shouldCommit('render_design', {commitUndo:false}), false);
  assert.equal(shouldCommit('undo', {}), false);
});

test('deletion confirm must be boolean true', () => {
  assert.doesNotThrow(() => assertConfirm(true));
  assert.throws(() => assertConfirm('yes'), /confirm=true/);
  assert.throws(() => assertConfirm(1), /confirm=true/);
  assert.throws(() => assertConfirm(false), /confirm=true/);
});

test('depth is clamped to the inspection range', () => {
  assert.equal(clampDepth(100, 6), 12);
  assert.equal(clampDepth(-4, 6), 0);
  assert.equal(clampDepth(3.9, 6), 3);
  assert.equal(clampDepth(undefined, 3), 3);
});

test('search accepts substrings and rejects expensive patterns', () => {
  assert.equal(matchesQuery('Hero Title', 'hero'), true);
  assert.equal(matchesQuery('Hero', '/hero/'), true);
  assert.equal(matchesQuery('nope', '/hero/'), false);
  assert.throws(() => matchesQuery('a', '/(a+)+/'), /expensive/);
  assert.throws(() => matchesQuery('a', `/${'a'.repeat(81)}/`), /80/);
  assert.throws(() => matchesQuery('a', '/[/'), /valid regular expression/);
});

test('paint targets accept singular and plural names', () => {
  assert.equal(paintTarget('stroke'), 'strokes');
  assert.equal(paintTarget('strokes'), 'strokes');
  assert.equal(paintTarget('fill'), 'fills');
  assert.equal(paintTarget(undefined), 'fills');
});

test('text content is read from the shapes agents actually send', () => {
  assert.equal(textCharacters({content:'A'}), 'A');
  assert.equal(textCharacters({characters:'B'}), 'B');
  assert.equal(textCharacters({text:'C'}), 'C');
  assert.equal(textCharacters({text:{characters:'D'}}), 'D');
  assert.equal(textCharacters({content:'A', text:'C'}), 'A');
  assert.equal(textCharacters(undefined), undefined);
});
