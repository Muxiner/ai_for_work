import { state, CUSTOM_FONT_FAMILY } from "./state.js";

export const LATIN_FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  times: '"Times New Roman", Times, Georgia',
  georgia: 'Georgia, "Times New Roman"',
  garamond: 'Garamond, "EB Garamond", "Times New Roman"',
  cambria: 'Cambria, Georgia, "Times New Roman"',
  calibri: 'Calibri, "Segoe UI", Arial',
  arial: 'Arial, "Helvetica Neue", Helvetica',
  helvetica: '"Helvetica Neue", Helvetica, Arial',
  verdana: 'Verdana, Geneva',
  tahoma: 'Tahoma, Verdana, Geneva',
  courier: '"Courier New", Courier',
  consolas: 'Consolas, "Courier New", Courier',
  custom: `"${CUSTOM_FONT_FAMILY}"`,
};

export const CJK_FONTS = {
  system: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB"',
  yahei: '"Microsoft YaHei", "微软雅黑", "PingFang SC"',
  pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"',
  sourcehan: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC"',
  heiti: '"SimHei", "Heiti SC", "Microsoft YaHei"',
  simsun: '"SimSun", "宋体", "Songti SC"',
  sourceserif: '"Source Han Serif SC", "Noto Serif SC", "Songti SC"',
  kai: '"Kaiti SC", "STKaiti", "KaiTi", "楷体"',
  fangsong: '"FangSong", "STFangsong", "仿宋"',
  custom: `"${CUSTOM_FONT_FAMILY}"`,
};

export function applyFont() {
  const latin = LATIN_FONTS[state.settings.fontLatin] || LATIN_FONTS.system;
  const cjk = CJK_FONTS[state.settings.fontCJK] || CJK_FONTS.system;
  document.body.style.setProperty("--font", `${latin}, ${cjk}, sans-serif`);
  const fl = document.getElementById("fontLatin");
  const fc = document.getElementById("fontCJK");
  if (fl) fl.value = state.settings.fontLatin;
  if (fc) fc.value = state.settings.fontCJK;
}

export function updateCustomFontOptions() {
  ["fontLatin", "fontCJK"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const opt = sel.querySelector('option[value="custom"]');
    if (opt) opt.hidden = !state.hasCustomFont;
  });
}

export async function registerCustomFont(dataUrl) {
  const face = new FontFace(CUSTOM_FONT_FAMILY, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
  state.customFontDataUrl = dataUrl;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("resume-fonts", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("fonts");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fonts", "readwrite");
    tx.objectStore("fonts").put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fonts", "readonly");
    const r = tx.objectStore("fonts").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadCustomFont() {
  try {
    const rec = await idbGet("custom");
    if (rec && rec.dataUrl) {
      await registerCustomFont(rec.dataUrl);
      state.hasCustomFont = true;
    }
  } catch (e) {}
  updateCustomFontOptions();
  if (state.hasCustomFont) applyFont();
}
