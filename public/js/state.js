export const KEYS = {
  MD: "resume-md-v1",
  PHOTO: "resume-photo-v1",
  SETTINGS: "resume-settings-v1",
  FILE: "resume-file-v1",
};

export const CUSTOM_FONT_FAMILY = "ResumeCustomFont";

export const DEFAULT_SETTINGS = {
  template: "classic",
  fontLatin: "system",
  fontCJK: "system",
  accent: null,
  photoOff: false,
  keywords: true,
  timeline: false,
  timelineTypes: ["experience", "projects", "education", "certificates"],
  timelineLine: "solid",
  timelineNode: "dot",
  timelineLayout: "right",
  hiddenSections: [],
  panelOpen: false,
};

export const state = {
  hasServer: false,
  dirty: false,
  lastSaveAt: 0,
  currentFile: null,
  files: [],
  settings: { ...DEFAULT_SETTINGS },
  hasCustomFont: false,
  customFontDataUrl: null,
};

export const SWATCHES = [
  "#2563eb", "#4f46e5", "#0f766e", "#16a34a",
  "#d97706", "#e11d48", "#b08d57", "#334155",
];

export const SECTION_KEYS = {
  "个人简介": "summary",
  "工作经历": "experience",
  "实习经历": "experience",
  "项目经历": "projects",
  "项目经验": "projects",
  "教育背景": "education",
  "教育经历": "education",
  "技能特长": "skills",
  "专业技能": "skills",
  "资格证书": "certificates",
  "资质证书": "certificates",
  "证书": "certificates",
  "求职意向": "intent",
  "获得荣誉": "honors",
  "荣誉奖项": "honors",
  "获奖情况": "honors",
  "所获荣誉": "honors",
  "获奖经历": "honors",
  "自我评价": "selfeval",
  "个人评价": "selfeval",
  "自我鉴定": "selfeval",
  "自我描述": "selfeval",
};

export const SECTION_CATALOG = [
  { title: "求职意向", key: "intent" },
  { title: "个人简介", key: "summary" },
  { title: "自我评价", key: "selfeval" },
  { title: "工作经历", key: "experience" },
  { title: "实习经历", key: "experience" },
  { title: "项目经历", key: "projects" },
  { title: "教育背景", key: "education" },
  { title: "资格证书", key: "certificates" },
  { title: "获得荣誉", key: "honors" },
  { title: "技能特长", key: "skills" },
  { title: "在校经历", key: "custom" },
];

export const TYPE_LABELS = {
  experience: "工作经历",
  projects: "项目经历",
  education: "教育背景",
  certificates: "资格证书",
};

export function getPage() {
  return document.getElementById("page");
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function inlineMd(text) {
  let s = esc(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_]+)_/g, "<em>$1</em>");
  return s;
}

export function txt(sel, root) {
  const el = (root || getPage()).querySelector(sel);
  return el ? el.textContent.trim() : "";
}

export function splitKeywords(s) {
  return String(s || "")
    .split(/[、,，;；/|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function keywordsHTML(kws) {
  return kws.map((k) => `<span class="kw">${esc(k)}</span>`).join("、");
}

export function safeFileName(s) {
  return String(s || "").replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function setStatus(msg) {
  const el = document.getElementById("saveState");
  if (el) el.textContent = msg;
}

export function saveSettings() {
  try { localStorage.setItem(KEYS.SETTINGS, JSON.stringify(state.settings)); } catch (e) {}
}
