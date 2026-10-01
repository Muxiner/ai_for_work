import { state, KEYS, SWATCHES } from "./state.js";
import { applyFont, updateCustomFontOptions, registerCustomFont, idbSet, loadCustomFont } from "./fonts.js";
import { renderTimelineTypes, refreshTimeline } from "./render.js";
import { fileToDataURL } from "./photo.js";

export function persistSettings() {
  try { localStorage.setItem(KEYS.SETTINGS, JSON.stringify(state.settings)); } catch (e) {}
}

export function renderSwatches() {
  const box = document.getElementById("swatches");
  if (!box) return;
  box.innerHTML = "";
  const auto = document.createElement("button");
  auto.className = "swatch auto";
  auto.dataset.color = "";
  auto.title = "跟随模板配色";
  box.appendChild(auto);
  SWATCHES.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.color = c;
    b.style.background = c;
    b.title = c;
    box.appendChild(b);
  });
  updateSwatchActive();
}

export function updateSwatchActive() {
  const box = document.getElementById("swatches");
  const current = state.settings.accent || "";
  if (box) {
    box.querySelectorAll(".swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.color === current);
    });
  }
  const picker = document.getElementById("accentPicker");
  if (picker) {
    const computed = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#2563eb";
    picker.value = current || computed;
    picker.classList.toggle("active", !!current && !SWATCHES.includes(current));
  }
}

export function applySettings() {
  const s = state.settings;
  document.body.dataset.template = s.template;
  document.body.classList.toggle("photo-off", !!s.photoOff);
  document.body.classList.toggle("hide-keywords", s.keywords === false);
  document.body.classList.toggle("timeline", !!s.timeline);
  if (s.accent) document.body.style.setProperty("--accent", s.accent);
  else document.body.style.removeProperty("--accent");

  const tplSelect = document.getElementById("tplSelect");
  if (tplSelect) tplSelect.value = s.template;
  applyFont();

  const photoToggle = document.getElementById("photoToggle");
  if (photoToggle) photoToggle.textContent = s.photoOff ? "显示照片" : "隐藏照片";
  const kwToggle = document.getElementById("kwToggle");
  if (kwToggle) kwToggle.textContent = s.keywords === false ? "显示关键词" : "隐藏关键词";
  const timelineToggle = document.getElementById("timelineToggle");
  if (timelineToggle) {
    timelineToggle.textContent = s.timeline ? "普通排版" : "时间轴排版";
    timelineToggle.classList.toggle("active", !!s.timeline);
  }

  document.body.dataset.tlline = s.timelineLine || "solid";
  document.body.dataset.tlnode = s.timelineNode || "dot";
  document.body.dataset.tllayout = s.timelineLayout || "right";
  const tlLine = document.getElementById("tlLine");
  const tlNode = document.getElementById("tlNode");
  const tlLayout = document.getElementById("tlLayout");
  if (tlLine) tlLine.value = s.timelineLine || "solid";
  if (tlNode) tlNode.value = s.timelineNode || "dot";
  if (tlLayout) tlLayout.value = s.timelineLayout || "right";
  const showTl = !!s.timeline;
  ["tlLineCtl", "tlNodeCtl", "tlLayoutCtl"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = showTl ? "" : "none";
  });

  updateSwatchActive();
  renderTimelineTypes();
  refreshTimeline();
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

export function bindControls() {
  on("tplSelect", "change", (e) => {
    state.settings.template = e.target.value;
    applySettings();
    persistSettings();
  });

  on("fontLatin", "change", (e) => {
    state.settings.fontLatin = e.target.value;
    applyFont();
    persistSettings();
  });
  on("fontCJK", "change", (e) => {
    state.settings.fontCJK = e.target.value;
    applyFont();
    persistSettings();
  });

  on("fontUploadBtn", "click", () => document.getElementById("fontInput").click());
  on("fontInput", "change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file);
      await registerCustomFont(dataUrl);
      await idbSet("custom", { name: file.name, dataUrl });
      state.hasCustomFont = true;
      updateCustomFontOptions();
      alert("字体已加载：" + file.name + "\n可在「英文 / 中文」中选「自定义字体」，导出 PDF 时会嵌入该字体。");
    } catch (err) {
      alert("字体加载失败：" + (err && err.message ? err.message : err));
    }
    e.target.value = "";
  });

  const swatches = document.getElementById("swatches");
  if (swatches) {
    swatches.addEventListener("click", (e) => {
      const s = e.target.closest(".swatch");
      if (!s) return;
      state.settings.accent = s.dataset.color || null;
      applySettings();
      persistSettings();
    });
  }

  on("accentPicker", "input", (e) => {
    state.settings.accent = e.target.value;
    applySettings();
    persistSettings();
  });

  on("timelineToggle", "click", () => {
    state.settings.timeline = !state.settings.timeline;
    applySettings();
    persistSettings();
  });
  on("tlLine", "change", (e) => { state.settings.timelineLine = e.target.value; applySettings(); persistSettings(); });
  on("tlNode", "change", (e) => { state.settings.timelineNode = e.target.value; applySettings(); persistSettings(); });
  on("tlLayout", "change", (e) => { state.settings.timelineLayout = e.target.value; applySettings(); persistSettings(); });

  const timelineTypes = document.getElementById("timelineTypes");
  if (timelineTypes) {
    timelineTypes.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const k = chip.dataset.key;
      const arr = state.settings.timelineTypes || (state.settings.timelineTypes = []);
      const i = arr.indexOf(k);
      if (i >= 0) arr.splice(i, 1); else arr.push(k);
      renderTimelineTypes();
      refreshTimeline();
      persistSettings();
    });
  }

  on("kwToggle", "click", () => {
    state.settings.keywords = state.settings.keywords === false;
    applySettings();
    persistSettings();
  });
  on("photoToggle", "click", () => {
    state.settings.photoOff = !state.settings.photoOff;
    applySettings();
    persistSettings();
  });

  loadCustomFont();
}
