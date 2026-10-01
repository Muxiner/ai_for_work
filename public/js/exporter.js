import { state, txt, safeFileName, setStatus, CUSTOM_FONT_FAMILY, getPage } from "./state.js";
import { save } from "./persist.js";

export function exportFileName() {
  const name = safeFileName(txt(".name")) || "简历";
  const role = safeFileName(txt(".role").split("·")[0]);
  return role ? `${name}-${role}` : name;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片渲染失败"));
    img.src = src;
  });
}

function collectCss() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + "\n";
    } catch (e) {
      /* cross-origin sheet — skip */
    }
  }
  if (state.customFontDataUrl) {
    css += `\n@font-face{font-family:"${CUSTOM_FONT_FAMILY}";src:url("${state.customFontDataUrl}");}`;
  }
  css += `\n.stage{padding:0 !important;display:block !important}` +
         `\n.page{box-shadow:none !important;border-radius:0 !important}`;
  return css;
}

export async function renderImageDataUrl(type) {
  const isJpg = type === "jpg";
  const pageEl = getPage();
  const w = Math.ceil(pageEl.getBoundingClientRect().width);
  const h = Math.ceil(pageEl.scrollHeight);
  const css = collectCss();

  const clone = pageEl.cloneNode(true);
  clone.querySelectorAll(".item-actions, .section-actions, .add-btn, .del-btn, .photo-del, .photo-ph").forEach((el) => el.remove());
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  const photo = clone.querySelector("#photo");
  if (!photo || !photo.style.backgroundImage) {
    const pw = clone.querySelector("#photoWrap");
    if (pw) pw.remove();
  }

  const bodyClasses = document.body.className.replace(/\bediting\b/g, "").trim();
  const escAttr = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dataAttrs = ["template", "tlline", "tlnode", "tllayout"]
    .map((k) => `data-${k}="${escAttr(document.body.dataset[k] || "")}"`).join(" ");
  const bodyStyle = document.body.getAttribute("style") || "";

  const cloneXml = new XMLSerializer().serializeToString(clone);
  const xhtml =
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><style><![CDATA[${css}]]></style></head>` +
    `<body class="${escAttr(bodyClasses)}" ${dataAttrs} style="${escAttr(bodyStyle)}">` +
    `<div class="stage">${cloneXml}</div></body></html>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;

  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(isJpg ? "image/jpeg" : "image/png", 0.95);
}

export async function exportImage(type) {
  setStatus("生成图片…");
  try {
    const dataUrl = await renderImageDataUrl(type);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = exportFileName() + (type === "jpg" ? ".jpg" : ".png");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus("已导出图片");
  } catch (e) {
    alert("图片导出失败：" + (e && e.message ? e.message : e));
    setStatus("导出失败");
  }
}

export function exportPDF() {
  if (state.dirty) save();
  const prev = document.title;
  document.title = exportFileName();
  window.addEventListener("afterprint", function once() {
    window.removeEventListener("afterprint", once);
    document.title = prev;
  });
  window.print();
}

export function bindExport() {
  const btn = document.getElementById("exportBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const fmt = document.getElementById("exportFormat").value;
    if (fmt === "png" || fmt === "jpg") exportImage(fmt);
    else exportPDF();
  });
}
