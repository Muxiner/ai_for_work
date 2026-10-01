import { state, KEYS, esc, setStatus } from "./state.js";
import { serialize, parseMarkdown } from "./markdown.js";
import { renderResume, syncEditableState, refreshTimeline } from "./render.js";
import { applyPhoto } from "./photo.js";
import * as api from "./api.js";

let saveTimer = null;
let listTimer = null;
let syncing = false;

export function defaultMarkdown() {
  const el = document.getElementById("defaultResume");
  return el ? el.textContent : "";
}

export function scheduleSave() {
  state.dirty = true;
  refreshTimeline();
  setStatus("保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

export async function save() {
  const md = serialize();
  try { localStorage.setItem(KEYS.MD, md); } catch (e) {}
  state.dirty = false;
  state.lastSaveAt = Date.now();
  if (!state.hasServer || !state.currentFile) { setStatus("已保存到本地"); return; }
  try {
    const ok = await api.writeResume(state.currentFile, md);
    setStatus(ok ? "已保存到 " + state.currentFile : "保存失败");
  } catch (e) {
    setStatus("保存失败（已存本地）");
  }
}

export function flush() {
  if (!state.hasServer || !state.dirty || !state.currentFile) return;
  api.beacon(state.currentFile, serialize());
}
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", flush);

export async function syncFromFile(file) {
  if (!state.hasServer || syncing || !state.currentFile) return;
  if (file && file !== state.currentFile) return;
  if (Date.now() - state.lastSaveAt < 1200) return;
  syncing = true;
  try {
    const md = await api.readResume(state.currentFile);
    if (md == null) return;
    if (md.trim() === serialize().trim()) return;
    if (state.dirty) {
      setStatus("文件被外部修改（本页有未保存改动）");
      return;
    }
    renderResume(parseMarkdown(md));
    applyPhoto();
    syncEditableState();
    setStatus("已从 " + state.currentFile + " 同步");
  } catch (e) {
  } finally {
    syncing = false;
  }
}

export function scheduleListRefresh() {
  clearTimeout(listTimer);
  listTimer = setTimeout(loadFileList, 300);
}

export async function reloadPage() {
  if (state.dirty) { try { await save(); } catch (e) {} }
  location.reload();
}

export function startAutoSave() {
  setInterval(() => { if (state.dirty) save(); }, 15000);
}

export function startSync() {
  if (!state.hasServer) return;
  api.subscribe((msg) => {
    if (msg.reload) { reloadPage(); return; }
    scheduleListRefresh();
    if (msg.file && msg.file === state.currentFile) syncFromFile(msg.file);
  });
}

export async function loadFileList() {
  if (!state.hasServer) return;
  try {
    state.files = await api.listResumes();
    renderFileSelect();
  } catch (e) {}
}

export function renderFileSelect() {
  const sel = document.getElementById("fileSelect");
  if (!sel) return;
  sel.innerHTML = state.files
    .map((f) => `<option value="${esc(f)}">${esc(f.replace(/\.md$/i, ""))}</option>`)
    .join("");
  if (state.currentFile) sel.value = state.currentFile;
}

export async function loadResume(file) {
  state.currentFile = file || null;
  if (state.currentFile) {
    try { localStorage.setItem(KEYS.FILE, state.currentFile); } catch (e) {}
  }
  let md = null;
  if (state.hasServer && state.currentFile) {
    try { md = await api.readResume(state.currentFile); } catch (e) {}
  }
  if (md == null) md = localStorage.getItem(KEYS.MD) || defaultMarkdown();
  renderResume(parseMarkdown(md));
  applyPhoto();
  syncEditableState();
  state.dirty = false;
  const sel = document.getElementById("fileSelect");
  if (sel && state.currentFile) sel.value = state.currentFile;
}
