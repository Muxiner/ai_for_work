const test = require('node:test');
const assert = require('node:assert/strict');
const { modules } = require('./helpers.cjs');

async function loadHistory() {
  const load = await modules();
  return load('history.js');
}

test('history records snapshots and moves undo/redo', async () => {
  const history = await loadHistory();
  history.reset('A');
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);

  history.record('B');
  assert.equal(history.canUndo(), true);
  assert.equal(history.size(), 2);

  assert.equal(history.undo('B'), 'A');
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo('A'), 'B');
  assert.equal(history.canRedo(), false);
});

test('undo keeps an unrecorded current state available for redo', async () => {
  const history = await loadHistory();
  history.reset('A');
  history.record('B');
  assert.equal(history.undo('C'), 'B');
  assert.equal(history.redo('B'), 'C');
});

test('new edits after undo discard the redo branch', async () => {
  const history = await loadHistory();
  history.reset('A');
  history.record('B');
  assert.equal(history.undo('B'), 'A');
  history.record('C');
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo('C'), 'A');
});

test('redo is unavailable when an edit invalidates the future', async () => {
  const history = await loadHistory();
  history.reset('A');
  history.record('B');
  history.undo('B');
  assert.equal(history.redo('C'), null);
  assert.equal(history.canRedo(), false);
});

test('duplicate records are ignored and align updates the current snapshot', async () => {
  const history = await loadHistory();
  history.reset('A');
  history.record('A');
  assert.equal(history.size(), 1);
  history.record('B');
  history.align('B2');
  assert.equal(history.size(), 2);
  assert.equal(history.undo('B2'), 'A');
  assert.equal(history.redo('A'), 'B2');
});

test('history is capped and keeps the newest snapshots', async () => {
  const history = await loadHistory();
  history.reset('0');
  for (let i = 1; i <= 105; i++) history.record(String(i));
  assert.equal(history.size(), 100);
  assert.equal(history.canUndo(), true);
  let current = '105';
  for (let i = 0; i < 99; i++) current = history.undo(current);
  assert.equal(current, '6');
  assert.equal(history.undo(current), null);
});
