import { state, esc, setStatus } from "./state.js";
import * as api from "./api.js";
import { save, loadFileList, loadResume, isNoSync } from "./persist.js";
import { alertDialog, confirmDialog } from "./dialog.js";

let dialog = null;
let listEl = null;
let subEl = null;
let previewTitle = null;
let previewText = null;
let restoreBtn = null;
let hintEl = null;
let refreshBtn = null;
let closeBtn = null;
let openBtn = null;

let names = [];
let selected = null;
let fileAtOpen = null;
let refreshToken = 0;
let previewToken = 0;

function canRestore() {
  return !!state.currentFile && !state.samplePreview && !isNoSync();
}

function backupDate(name) {
  const file = fileAtOpen || state.currentFile || "";
  const prefix = file.replace(/\.md$/i, "") + ".";
  const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const match = rest.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) return null;
  const date = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7])
  ));
  return isNaN(date.getTime()) ? null : date;
}

function formatBackupTime(name) {
  const date = backupDate(name);
  if (!date) return name;
  try {
    return date.toLocaleString("zh-CN", { hour12: false });
  } catch (e) {
    return date.toISOString();
  }
}

function timeAgo(name) {
  const date = backupDate(name);
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + " 分钟前";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " 小时前";
  const days = Math.round(hours / 24);
  return days + " 天前";
}

function updateRestoreState() {
  if (restoreBtn) restoreBtn.disabled = !selected || !canRestore();
  if (hintEl) {
    hintEl.textContent = canRestore()
      ? "恢复前会自动备份当前内容"
      : "只读模式：可以查看备份，不能恢复";
  }
}

function updateSelection() {
  if (!listEl) return;
  listEl.querySelectorAll(".backup-item").forEach((item) => {
    const active = item.dataset.name === selected;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  updateRestoreState();
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!names.length) {
    listEl.innerHTML = '<div class="backup-empty">当前简历还没有备份。<br>覆盖保存或删除前会自动创建备份，每份简历最多保留 30 份。</div>';
    if (previewTitle) previewTitle.textContent = "暂无备份";
    if (previewText) previewText.textContent = "";
    selected = null;
    updateRestoreState();
    return;
  }
  names.forEach((name, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "backup-item";
    item.dataset.name = name;
    item.setAttribute("aria-pressed", String(name === selected));
    item.setAttribute("aria-label", "备份 " + formatBackupTime(name) + (index === 0 ? "，最新" : ""));
    item.innerHTML =
      '<span class="backup-time">' + esc(formatBackupTime(name)) + "</span>" +
      '<span class="backup-meta">' + (index === 0 ? "最新 · " : "") + esc(timeAgo(name)) + "</span>";
    listEl.appendChild(item);
  });
  updateSelection();
}

async function selectBackup(name) {
  if (!name || !dialog || !dialog.open) return;
  selected = name;
  const token = ++previewToken;
  const file = fileAtOpen;
  updateSelection();
  if (previewTitle) previewTitle.textContent = formatBackupTime(name) + " · 读取中…";
  if (previewText) previewText.textContent = "";
  const md = await api.readBackup(file, name);
  if (!dialog.open || token !== previewToken || selected !== name) return;
  if (md == null) {
    if (previewTitle) previewTitle.textContent = formatBackupTime(name);
    if (previewText) previewText.textContent = "备份内容读取失败。";
    return;
  }
  const size = typeof TextEncoder === "function" ? new TextEncoder().encode(md).length : md.length;
  if (previewTitle) previewTitle.textContent = formatBackupTime(name) + " · " + (size / 1024).toFixed(1) + " KB";
  if (previewText) previewText.textContent = md;
}

async function refresh() {
  if (!dialog || !dialog.open) return;
  const file = state.currentFile;
  if (!file) return;
  fileAtOpen = file;
  const token = ++refreshToken;
  ++previewToken;
  if (subEl) subEl.textContent = "「" + file + "」的自动备份 · 最多保留 30 份";
  if (listEl) listEl.innerHTML = '<div class="backup-empty">加载中…</div>';
  if (previewTitle) previewTitle.textContent = "选择一份备份";
  if (previewText) previewText.textContent = "";
  selected = null;
  updateRestoreState();

  let list = [];
  try { list = await api.listBackups(file); } catch (e) {}
  if (!dialog.open || token !== refreshToken || state.currentFile !== file) return;
  names = Array.isArray(list) ? list : [];
  selected = names[0] || null;
  renderList();
  if (selected) await selectBackup(selected);
}

async function restore() {
  if (!selected || !canRestore()) return;
  const file = state.currentFile;
  const label = formatBackupTime(selected);
  if (!(await confirmDialog("确定用「" + label + "」的备份恢复「" + file + "」吗？\n恢复前会自动备份当前内容。", {
    title: "恢复备份",
    okText: "恢复",
  }))) return;
  if (state.dirty) {
    const ok = await save();
    if (!ok || state.dirty) {
      setStatus("当前修改未保存，已取消恢复");
      return;
    }
  }
  const ok = await api.restoreBackup(file, selected);
  if (!ok) {
    await alertDialog("恢复失败，请稍后重试。", { title: "恢复失败" });
    return;
  }
  dialog.close();
  await loadFileList();
  if (await loadResume(file)) setStatus("已从 " + label + " 的备份恢复");
}

function openPanel() {
  if (!dialog || !state.hasServer || !state.currentFile || dialog.open) return;
  if (state.samplePreview) {
    setStatus("示例预览中，请先返回我的简历");
    return;
  }
  fileAtOpen = state.currentFile;
  document.querySelectorAll(".menu.open").forEach((menu) => {
    menu.classList.remove("open");
    const btn = menu.querySelector(".menu-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
  document.body.classList.add("modal-open");
  dialog.showModal();
  refresh();
}

export function bindBackupHistory() {
  dialog = document.getElementById("backupDialog");
  openBtn = document.getElementById("backupHistoryBtn");
  if (!dialog || !openBtn) return;

  listEl = document.getElementById("backupList");
  subEl = document.getElementById("backupSub");
  previewTitle = document.getElementById("backupPreviewTitle");
  previewText = document.getElementById("backupPreviewText");
  restoreBtn = document.getElementById("backupRestore");
  hintEl = document.getElementById("backupHint");
  refreshBtn = document.getElementById("backupRefresh");
  closeBtn = document.getElementById("backupClose");

  openBtn.addEventListener("click", openPanel);
  if (closeBtn) closeBtn.addEventListener("click", () => dialog.close());
  if (refreshBtn) refreshBtn.addEventListener("click", refresh);
  if (restoreBtn) restoreBtn.addEventListener("click", restore);
  if (listEl) {
    listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".backup-item");
      if (item) selectBackup(item.dataset.name);
    });
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    ++refreshToken;
    ++previewToken;
  });
}
