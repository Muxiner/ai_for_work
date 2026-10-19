import { state, KEYS, setStatus, esc } from "./state.js";
import * as api from "./api.js";
import { parseMarkdown, serialize } from "./markdown.js";
import { renderResume, syncEditableState } from "./render.js";
import {
  save, loadFileList, renderFileSelect, loadResume,
  startAutoSave, startSync, isNoSync,
} from "./persist.js";
import { renderSwatches, applySettings, bindControls } from "./settings.js";
import { bindEditor } from "./editor.js";
import { bindExport, renderImageDataUrl } from "./exporter.js";

window.__renderImageDataUrl = renderImageDataUrl;
window.__serialize = serialize;

function renderSampleList() {
  const list = document.getElementById("sampleList");
  if (!list) return;
  list.innerHTML = (state.sampleFiles || [])
    .map((f) => `<button type="button" class="file-item${f === state.samplePreview ? " active" : ""}" data-sample="${esc(f)}">${esc(f.replace(/\.md$/i, ""))}</button>`)
    .join("");
}

async function populateSamples() {
  const list = document.getElementById("sampleList");
  if (!list) return;
  let files = [];
  try { files = await api.listSamples(); } catch (e) {}
  state.sampleFiles = files;
  if (!files.length) {
    const t = list.previousElementSibling;
    if (t && t.classList.contains("panel-title")) t.style.display = "none";
    list.style.display = "none";
    return;
  }
  renderSampleList();
  list.addEventListener("click", (e) => {
    const b = e.target.closest(".file-item");
    if (!b) return;
    enterSamplePreview(b.dataset.sample);
  });
}

function setPreviewUI(on, name) {
  const banner = document.getElementById("previewBanner");
  if (banner) banner.hidden = !on;
  const pn = document.getElementById("previewName");
  if (pn) pn.textContent = name || "";
  document.body.classList.toggle("sample-preview", on);
}

let previewRequest = 0;

async function preserveCurrent() {
  if (state.samplePreview || !state.dirty) return true;
  return (await save()) && !state.dirty;
}

function canMutate() {
  if (!state.samplePreview && !isNoSync()) return true;
  setStatus(isNoSync() ? "只读模式（nosync）" : "示例预览，请先返回我的简历");
  return false;
}

function clearPreview() {
  previewRequest++;
  if (!state.samplePreview) return;
  state.samplePreview = null;
  setPreviewUI(false);
  document.body.classList.remove("sample-preview");
  if (state._prevEditing !== false) document.body.classList.add("editing");
  syncEditableState();
  renderSampleList();
}

async function enterSamplePreview(file) {
  if (!file || !(await preserveCurrent())) return;
  const request = ++previewRequest;
  const currentFile = state.currentFile;
  let md = null;
  try { md = await api.readSample(file); } catch (e) {}
  if (request !== previewRequest || currentFile !== state.currentFile) return;
  if (!md) { alert("示例读取失败"); return; }
  if (!(await preserveCurrent()) || request !== previewRequest) return;
  if (!state.samplePreview) state._prevEditing = document.body.classList.contains("editing");
  state.samplePreview = file;
  document.body.classList.remove("editing");
  renderResume(parseMarkdown(md));
  syncEditableState();
  setPreviewUI(true, file.replace(/\.md$/i, ""));
  renderSampleList();
  setStatus("示例预览：" + file.replace(/\.md$/i, ""));
}

async function duplicateSample() {
  if (isNoSync()) return;
  const src = state.samplePreview;
  if (!src) return;
  const name = prompt("基于该示例新建简历，文件名：", src.replace(/\.md$/i, "") + "-副本");
  if (name == null || !name.trim()) return;
  const md = await api.readSample(src);
  if (!md) { alert("示例读取失败"); return; }
  const r = await api.createResume(name.trim());
  if (r.error === "exists") { alert("同名文件已存在"); return; }
  if (r.error) { alert("创建失败"); return; }
  if (!(await api.writeResume(r.file, md))) { alert("示例保存失败，请重试。"); return; }
  await loadFileList();
  if (!(await loadResume(r.file))) return;
  clearPreview();
  setStatus("已基于示例新建 " + r.file);
}

function bindFileControls() {
  const fileList = document.getElementById("fileList");
  const newFileBtn = document.getElementById("newFileBtn");
  const delFileBtn = document.getElementById("delFileBtn");
  const toggleBtn = document.getElementById("toggleEdit");

  if (fileList) {
    fileList.addEventListener("click", async (e) => {
      const b = e.target.closest(".file-item");
      if (!b) return;
      const file = b.dataset.file;
      if (!file) return;
      if (file === state.currentFile && !state.samplePreview) return;
      if (!(await preserveCurrent())) return;
      previewRequest++;
      if (!(await loadResume(file))) return;
      clearPreview();
      setStatus("已切换到 " + state.currentFile);
    });
  }

  if (newFileBtn) {
    newFileBtn.addEventListener("click", async () => {
      if (!canMutate()) return;
      const name = prompt("新建简历文件名（如：张三-嵌入式）：", "");
      if (name == null || !name.trim()) return;
      if (!(await preserveCurrent())) return;
      const r = await api.createResume(name.trim());
      if (r.error === "exists") { alert("同名文件已存在"); return; }
      if (r.error) { alert("创建失败"); return; }
      await loadFileList();
      if (!(await loadResume(r.file))) return;
      setStatus("已新建 " + r.file);
    });
  }

  if (delFileBtn) {
    delFileBtn.addEventListener("click", async () => {
      if (!canMutate() || !(await preserveCurrent())) return;
      if (!state.currentFile) return;
      if (!confirm("确定删除 " + state.currentFile + " 吗？该操作不可撤销。")) return;
      const ok = await api.deleteResume(state.currentFile);
      if (!ok) { alert("删除失败"); return; }
      try { localStorage.removeItem(KEYS.PHOTO + ":" + state.currentFile); } catch (e) {}
      await loadFileList();
      if (!(await loadResume(state.files[0] || null))) return;
      setStatus("已删除");
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const editing = document.body.classList.toggle("editing");
      toggleBtn.textContent = editing ? "预览模式" : "编辑模式";
      toggleBtn.classList.toggle("active", !editing);
      syncEditableState();
      if (!editing && state.dirty) save();
    });
  }

  const dupSampleBtn = document.getElementById("dupSampleBtn");
  if (dupSampleBtn) dupSampleBtn.addEventListener("click", duplicateSample);
  const exitPreviewBtn = document.getElementById("exitPreviewBtn");
  if (exitPreviewBtn) {
    exitPreviewBtn.addEventListener("click", async () => {
      if (!(await loadResume(state.currentFile))) return;
      clearPreview();
      setStatus("已返回 " + (state.currentFile || ""));
    });
  }

  const renameFileBtn = document.getElementById("renameFileBtn");
  if (renameFileBtn) {
    renameFileBtn.addEventListener("click", async () => {
      if (!canMutate()) return;
      if (!state.currentFile) return;
      const cur = state.currentFile.replace(/\.md$/i, "");
      const name = prompt("重命名简历：", cur);
      if (name == null || !name.trim() || name.trim() === cur) return;
      if (!(await preserveCurrent())) return;
      const oldFile = state.currentFile;
      const r = await api.renameResume(oldFile, name.trim());
      if (r.error === "exists") { alert("同名文件已存在"); return; }
      if (r.error) { alert("重命名失败"); return; }
      try {
        const pk = KEYS.PHOTO + ":" + oldFile;
        const data = localStorage.getItem(pk);
        if (data) { localStorage.setItem(KEYS.PHOTO + ":" + r.file, data); localStorage.removeItem(pk); }
      } catch (e) {}
      await loadFileList();
      if (!(await loadResume(r.file))) return;
      setStatus("已重命名为 " + r.file);
    });
  }

  const restoreBackupBtn = document.getElementById("restoreBackupBtn");
  if (restoreBackupBtn) {
    restoreBackupBtn.addEventListener("click", async () => {
      if (!canMutate() || !(await preserveCurrent())) return;
      if (!state.currentFile) return;
      let backups = [];
      try { backups = await api.listBackups(state.currentFile); } catch (e) {}
      if (!backups.length) { alert("当前简历没有可用的备份。"); return; }
      const latest = backups[0];
      if (!confirm("确定用最近一次备份恢复「" + state.currentFile + "」吗？\n备份：" + latest)) return;
      const ok = await api.restoreBackup(state.currentFile, latest);
      if (!ok) { alert("恢复失败"); return; }
      if (!(await loadResume(state.currentFile))) return;
      setStatus("已从备份恢复");
    });
  }
}

function bindMenus() {
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.closest(".menu");
      const wasOpen = menu.classList.contains("open");
      document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
      if (!wasOpen) menu.classList.add("open");
    });
  });
  document.querySelectorAll(".menu-panel").forEach((p) => {
    p.addEventListener("click", (e) => e.stopPropagation());
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  });
}

async function init() {
  try {
    state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem(KEYS.SETTINGS) || "{}") };
  } catch (e) {}

  try {
    state.files = await api.listResumes();
    state.hasServer = true;
  } catch (e) {}

  if (state.hasServer) {
    renderFileSelect();
    const saved = localStorage.getItem(KEYS.FILE);
    state.currentFile = state.files.includes(saved) ? saved : (state.files[0] || null);
  }

  try {
    const legacy = localStorage.getItem(KEYS.PHOTO);
    if (legacy && state.currentFile) {
      const k = KEYS.PHOTO + ":" + state.currentFile;
      if (!localStorage.getItem(k)) localStorage.setItem(k, legacy);
      localStorage.removeItem(KEYS.PHOTO);
    }
  } catch (e) {}

  const show = state.hasServer ? "" : "none";
  ["fileCtl", "newFileBtn", "delFileBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show;
  });
  const fileMenu = document.getElementById("fileMenu");
  if (fileMenu) fileMenu.style.display = show;

  await loadResume(state.currentFile);

  renderSwatches();
  applySettings();
  syncEditableState();
  await populateSamples();

  setStatus(state.dirty ? "已恢复未保存草稿，请检查后保存" : (state.hasServer ? "已连接 " + (state.currentFile || "本地") : "本地保存（未连接服务）"));

  if (!new URLSearchParams(location.search).has("nosync")) {
    startAutoSave();
    startSync();
  }
}

bindEditor();
bindExport();
bindControls();
bindFileControls();
bindMenus();
init();
