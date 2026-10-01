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
  "项目经历": "projects",
  "教育背景": "education",
  "技能特长": "skills",
  "资格证书": "certificates",
  "求职意向": "intent",
};

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
