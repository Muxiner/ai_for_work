import { state } from "./state.js";
import { parseMarkdown, serialize } from "./markdown.js";
import { renderResume, syncEditableState } from "./render.js";
import { applyPhoto } from "./photo.js";
import { scheduleSave, isNoSync } from "./persist.js";
import * as history from "./history.js";

function canEdit() {
  return !state.samplePreview && !isNoSync() && document.body.classList.contains("editing");
}

function nodePath(node, root) {
  const path = [];
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === root ? path : null;
}

function captureSelection() {
  const page = document.getElementById("page");
  const selection = window.getSelection && window.getSelection();
  if (!page || !selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!page.contains(range.startContainer)) return null;
  const path = nodePath(range.startContainer, page);
  if (!path || !path.length) return null;
  return { path, offset: range.startOffset };
}

function restoreSelection(saved) {
  if (!saved) return;
  const page = document.getElementById("page");
  if (!page) return;
  let node = page;
  for (const step of saved.path) {
    node = node.childNodes[step];
    if (!node) return;
  }
  const host = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const editable = host && host.closest ? host.closest("[contenteditable]") : null;
  if (!editable) return;
  editable.focus();
  const offset = Math.max(0, Math.min(
    saved.offset,
    node.nodeType === Node.TEXT_NODE ? node.nodeValue.length : node.childNodes.length
  ));
  try {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (e) {}
}

function applySnapshot(md) {
  if (md == null) return false;
  const selection = captureSelection();
  renderResume(parseMarkdown(md));
  applyPhoto();
  syncEditableState();
  history.align(serialize());
  state.dirty = true;
  scheduleSave();
  restoreSelection(selection);
  return true;
}

export function undo() {
  if (!canEdit()) return false;
  return applySnapshot(history.undo(serialize()));
}

export function redo() {
  if (!canEdit()) return false;
  return applySnapshot(history.redo(serialize()));
}

export function bindHistoryControls() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  function update() {
    const editable = canEdit();
    if (undoBtn) undoBtn.disabled = !editable || !history.canUndo();
    if (redoBtn) redoBtn.disabled = !editable || !history.canRedo();
  }

  history.onHistoryChange(update);
  update();

  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (redoBtn) redoBtn.addEventListener("click", redo);

  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = String(e.key || "").toLowerCase();
    const isUndo = key === "z" && !e.shiftKey;
    const isRedo = key === "y" || (key === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;
    const target = e.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (!canEdit()) return;
    e.preventDefault();
    if (isUndo) undo();
    else redo();
  });

  return { update };
}
