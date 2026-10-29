const LIMIT = 100;

let snapshots = [];
let index = -1;
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try { listener(); } catch (e) {}
  }
}

function valueOf(md) {
  return String(md == null ? "" : md);
}

function push(md) {
  const value = valueOf(md);
  if (!snapshots.length) {
    snapshots = [value];
    index = 0;
    notify();
    return;
  }
  if (value === snapshots[index]) return;
  snapshots = snapshots.slice(0, index + 1);
  snapshots.push(value);
  if (snapshots.length > LIMIT) snapshots.shift();
  index = snapshots.length - 1;
  notify();
}

export function onHistoryChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reset(md) {
  snapshots = [valueOf(md)];
  index = 0;
  notify();
}

export function record(md) {
  push(md);
}

export function align(md) {
  if (!snapshots.length) return;
  const value = valueOf(md);
  if (value !== snapshots[index]) {
    snapshots[index] = value;
    notify();
  }
}

export function undo(md) {
  push(md);
  if (index <= 0) return null;
  index -= 1;
  notify();
  return snapshots[index];
}

export function redo(md) {
  push(md);
  if (index >= snapshots.length - 1) return null;
  index += 1;
  notify();
  return snapshots[index];
}

export function canUndo() {
  return index > 0;
}

export function canRedo() {
  return index >= 0 && index < snapshots.length - 1;
}

export function size() {
  return snapshots.length;
}
