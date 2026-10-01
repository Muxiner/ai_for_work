import { state, KEYS, setStatus, esc } from "./state.js";
import * as api from "./api.js";
import { parseMarkdown } from "./markdown.js";
import { renderResume, syncEditableState } from "./render.js";
import { applyPhoto } from "./photo.js";
import {
  save, loadFileList, renderFileSelect, loadResume,
  startAutoSave, startSync, defaultMarkdown,
} from "./persist.js";
import { renderSwatches, applySettings, bindControls } from "./settings.js";
import { bindEditor } from "./editor.js";
import { bindExport, renderImageDataUrl } from "./exporter.js";

window.__renderImageDataUrl = renderImageDataUrl;

async function populateSamples() {
  const sel = document.getElementById("sampleSelect");
  if (!sel) return;
  let files = [];
  try { files = await api.listSamples(); } catch (e) {}
  if (!files.length) {
    const ctl = sel.closest(".ctl");
    if (ctl) ctl.style.display = "none";
    return;
  }
  sel.innerHTML = files
    .map((f) => `<option value="${esc(f)}">${esc(f.replace(/\.md$/i, ""))}</option>`)
    .join("");
}

function bindFileControls() {
  const fileSelect = document.getElementById("fileSelect");
  const newFileBtn = document.getElementById("newFileBtn");
  const delFileBtn = document.getElementById("delFileBtn");
  const toggleBtn = document.getElementById("toggleEdit");
  const resetBtn = document.getElementById("resetBtn");

  if (fileSelect) {
    fileSelect.addEventListener("change", async () => {
      if (state.dirty) await save();
      await loadResume(fileSelect.value);
      setStatus("已切换到 " + state.currentFile);
    });
  }

  if (newFileBtn) {
    newFileBtn.addEventListener("click", async () => {
      const name = prompt("新建简历文件名（如：张三-嵌入式）：", "");
      if (name == null || !name.trim()) return;
      if (state.dirty) await save();
      const r = await api.createResume(name.trim());
      if (r.error === "exists") { alert("同名文件已存在"); return; }
      if (r.error) { alert("创建失败"); return; }
      await loadFileList();
      await loadResume(r.file);
      setStatus("已新建 " + r.file);
    });
  }

  if (delFileBtn) {
    delFileBtn.addEventListener("click", async () => {
      if (!state.currentFile) return;
      if (!confirm("确定删除 " + state.currentFile + " 吗？该操作不可撤销。")) return;
      const ok = await api.deleteResume(state.currentFile);
      if (!ok) { alert("删除失败"); return; }
      try { localStorage.removeItem(KEYS.PHOTO + ":" + state.currentFile); } catch (e) {}
      await loadFileList();
      await loadResume(state.files[0] || null);
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

  if (resetBtn) {
    const sampleSelect = document.getElementById("sampleSelect");
    resetBtn.addEventListener("click", async () => {
      const file = sampleSelect ? sampleSelect.value : "";
      let md = null;
      if (file) { try { md = await api.readSample(file); } catch (e) {} }
      if (!md) md = defaultMarkdown();
      const label = file ? file.replace(/\.md$/i, "") : "默认";
      if (!confirm("确定要用「" + label + "」示例覆盖当前简历吗？\n（当前内容会自动备份，可用「恢复备份」还原）")) return;
      let backup = null;
      if (state.hasServer && state.currentFile) {
        try { backup = await api.backupResume(state.currentFile); } catch (e) {}
      }
      renderResume(parseMarkdown(md));
      applyPhoto();
      syncEditableState();
      await save();
      setStatus(backup ? "已套用示例（原内容已备份）" : "已套用示例");
    });
  }

  const restoreBackupBtn = document.getElementById("restoreBackupBtn");
  if (restoreBackupBtn) {
    restoreBackupBtn.addEventListener("click", async () => {
      if (!state.currentFile) return;
      let backups = [];
      try { backups = await api.listBackups(state.currentFile); } catch (e) {}
      if (!backups.length) { alert("当前简历没有可用的备份。"); return; }
      const latest = backups[0];
      if (!confirm("确定用最近一次备份恢复「" + state.currentFile + "」吗？\n备份：" + latest)) return;
      const ok = await api.restoreBackup(state.currentFile, latest);
      if (!ok) { alert("恢复失败"); return; }
      await loadResume(state.currentFile);
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
  populateSamples();

  setStatus(state.hasServer ? "已连接 " + (state.currentFile || "本地") : "本地保存（未连接服务）");

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
