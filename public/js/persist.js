import { state, KEYS, esc, setStatus } from "./state.js";
import { serialize, parseMarkdown } from "./markdown.js";
import { renderResume, syncEditableState, refreshTimeline } from "./render.js";
import { applyPhoto } from "./photo.js";
import * as api from "./api.js";

let saveTimer = null;
let listTimer = null;
let syncing = false;
let saveTask = null;
let loadGeneration = 0;
let ready = false;

function pageHasContent() {
  const page = document.getElementById("page");
  if (!page) return false;
  const name = page.querySelector(".name");
  const sections = page.querySelectorAll(".content > section");
  return !!((name && name.textContent.trim()) || sections.length > 0);
}

export function isNoSync() {
  try { return new URLSearchParams(location.search).has("nosync"); } catch (e) { return false; }
}

export function defaultMarkdown() {
  const el = document.getElementById("defaultResume");
  return el ? el.textContent : "";
}

function cacheKey(file) {
  return KEYS.MD + ":" + (file || "local");
}

function cacheDraft(file, md) {
  try { localStorage.setItem(cacheKey(file), md); return true; }
  catch (e) { return false; }
}

export function scheduleSave() {
  if (state.samplePreview || isNoSync()) return;
  state.dirty = true;
  if (ready && pageHasContent()) cacheDraft(state.currentFile, serialize());
  refreshTimeline();
  setStatus("保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

async function saveCurrent() {
  if (state.samplePreview || isNoSync()) return false;
  if (!ready || !pageHasContent()) {
    setStatus("尚未就绪或内容为空，未保存");
    return false;
  }
  const file = state.currentFile;
  const generation = loadGeneration;
  const md = serialize();
  const cached = cacheDraft(file, md);
  let ok = false;
  try {
    ok = state.hasServer && file ? await api.writeResume(file, md) : cached;
  } catch (e) {
    ok = false;
  }
  if (generation !== loadGeneration || file !== state.currentFile) return ok;
  if (ok) {
    state.dirty = serialize() !== md;
    state.lastSaveAt = Date.now();
    try {
      if (state.hasServer && file && localStorage.getItem(cacheKey(file)) === md) localStorage.removeItem(cacheKey(file));
    } catch (e) {}
    setStatus(state.dirty ? "仍有修改待保存" : (state.hasServer && file ? "已保存到 " + file : "已保存到本地"));
  } else {
    state.dirty = true;
    setStatus(api.hasConflict(file) ? "文件已被修改，请先导出当前内容再重新加载" :
      (cached ? "保存失败，草稿已存本地，将重试" : "保存失败，草稿未能缓存，请勿关闭页面"));
  }
  return ok;
}

export async function save() {
  clearTimeout(saveTimer);
  if (saveTask) {
    const ok = await saveTask;
    return ok && state.dirty ? save() : ok;
  }
  saveTask = saveCurrent();
  try { return await saveTask; }
  finally { saveTask = null; }
}

export function flush() {
  if (!ready || state.samplePreview || !state.hasServer || !state.dirty || !state.currentFile || isNoSync()) return;
  if (!pageHasContent()) return;
  const md = serialize();
  cacheDraft(state.currentFile, md);
  // An in-flight write already owns the current revision. Avoid racing a beacon.
  if (!saveTask) api.beacon(state.currentFile, md);
}
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", flush);

export async function syncFromFile(file) {
  if (!state.hasServer || syncing || !state.currentFile || state.samplePreview) return;
  if (file && file !== state.currentFile) return;
  if (saveTask) return;
  const currentFile = state.currentFile;
  const generation = loadGeneration;
  syncing = true;
  try {
    const md = await api.readResume(currentFile, false);
    if (generation !== loadGeneration || currentFile !== state.currentFile || state.samplePreview || saveTask) return;
    if (md == null) return;
    if (md.trim() === serialize().trim()) { api.acceptRevision(currentFile, md); return; }
    if (state.dirty) {
      setStatus("文件被外部修改（本页有未保存改动）");
      return;
    }
    api.acceptRevision(currentFile, md);
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
  if (state.samplePreview) return;
  if (state.dirty && !(await save())) return;
  if (state.dirty) return;
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
    if (msg.resync || (msg.file && msg.file === state.currentFile)) syncFromFile(msg.file);
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
  const list = document.getElementById("fileList");
  if (!list) return;
  list.innerHTML = state.files
    .map((f) => `<button type="button" class="file-item${f === state.currentFile ? " active" : ""}" data-file="${esc(f)}">${esc(f.replace(/\.md$/i, ""))}</button>`)
    .join("");
}

export async function loadResume(file) {
  const generation = ++loadGeneration;
  const target = file || null;
  const previous = ready ? serialize() : null;
  let recovered = false;
  let md = null;
  if (state.hasServer && target) {
    try { md = await api.readResume(target, false); } catch (e) {}
    if (generation !== loadGeneration) return false;
    if (md == null) {
      setStatus("读取失败，已保留当前简历");
      return false;
    }
  } else {
    try { md = localStorage.getItem(cacheKey(target)); } catch (e) {}
  }
  if (generation !== loadGeneration) return false;
  if (ready && !state.samplePreview && (state.dirty || serialize() !== previous)) {
    setStatus("加载期间有新修改，已保留当前简历，请保存后重试");
    return false;
  }
  if (target && state.hasServer) {
    api.acceptRevision(target, md);
    try {
      const draft = localStorage.getItem(cacheKey(target));
      if (draft && draft !== md && confirm("发现「" + target + "」的未保存草稿，是否恢复？")) {
        md = draft;
        recovered = true;
      }
    } catch (e) {}
  }
  if (md == null || !String(md).trim()) md = defaultMarkdown();
  clearTimeout(saveTimer);
  state.currentFile = target;
  if (target) {
    try { localStorage.setItem(KEYS.FILE, target); } catch (e) {}
  }
  renderResume(parseMarkdown(md));
  applyPhoto();
  syncEditableState();
  state.dirty = recovered;
  ready = true;
  renderFileSelect();
  return true;
}
