import { state, esc, inlineMd, keywordsHTML, getPage, TYPE_LABELS, SECTION_KEYS, SECTION_CATALOG } from "./state.js";
import { parseMarkdown } from "./markdown.js";
import { svgIcon, LABEL_ICON, SECTION_ICON } from "./icons.js";

export const TEMPLATES = {
  experience: `
    <button class="del-btn" title="删除">×</button>
    <div class="item-row">
      <div>
        <div class="item-title" contenteditable="true">公司名称</div>
        <div class="item-sub" contenteditable="true">职位名称</div>
      </div>
      <div class="item-date" contenteditable="true">2024.01 – 至今</div>
    </div>
    <ul class="item-desc" contenteditable="true">
      <li>在这里描述你的工作职责与成果。</li>
    </ul>`,
  projects: `
    <button class="del-btn" title="删除">×</button>
    <div class="item-row">
      <div>
        <div class="item-title" contenteditable="true">项目名称</div>
        <div class="item-sub" contenteditable="true">担任角色</div>
      </div>
      <div class="item-date" contenteditable="true">2024.01 – 2024.06</div>
    </div>
    <ul class="item-desc" contenteditable="true">
      <li>在这里描述项目背景、你的贡献与成果。</li>
    </ul>`,
  education: `
    <button class="del-btn" title="删除">×</button>
    <div class="item-row">
      <div>
        <div class="item-title" contenteditable="true">学校名称</div>
        <div class="item-sub" contenteditable="true">专业 · 学历</div>
      </div>
      <div class="item-date" contenteditable="true">2015.09 – 2019.06</div>
    </div>
    <div class="item-kw"><span class="kw-label">关键词</span><span class="item-kw-text" contenteditable="true"><span class="kw">主修课程</span></span></div>`,
  certificates: `
    <button class="del-btn" title="删除">×</button>
    <div class="item-row">
      <div>
        <div class="item-title" contenteditable="true">证书名称</div>
        <div class="item-sub" contenteditable="true">颁发机构</div>
      </div>
      <div class="item-date" contenteditable="true">2024.06</div>
    </div>`,
  skill: `<span class="skill-text" contenteditable="true"><b>分类</b><span class="skill-tags"><span class="skill-tag">技能关键词</span></span></span><button class="del-btn" title="删除" contenteditable="false">×</button>`,
  honor: `<span class="honor-text" contenteditable="true">荣誉名称</span>` + honorActions(),
  selfeval: `<span class="honor-text" contenteditable="true">要点描述</span>` + honorActions(),
  intent: `<span class="intent-label" contenteditable="true">意向岗位</span><span class="intent-value" contenteditable="true">工程师</span><button class="del-btn" title="删除" contenteditable="false">×</button>`,
};

export function photoMarkup() {
  return `<div class="photo-wrap" id="photoWrap" title="点击上传照片">
    <div class="photo" id="photo"></div>
    <div class="photo-ph"><span class="plus">＋</span><span>照片</span></div>
    <button class="photo-del" id="photoDel" title="移除照片">×</button>
    <input type="file" id="photoInput" accept="image/*" hidden />
  </div>`;
}

export function itemActions(allowMove) {
  const move = allowMove
    ? `<button class="move-btn" data-move="up" title="上移">${svgIcon("up")}</button>` +
      `<button class="move-btn" data-move="down" title="下移">${svgIcon("down")}</button>`
    : "";
  return `<div class="item-actions">${move}<button class="del-btn" title="删除">×</button></div>`;
}

export function sectionActions() {
  return `<div class="section-actions">` +
    `<button class="move-btn" data-move="up" title="上移">${svgIcon("up")}</button>` +
    `<button class="move-btn" data-move="down" title="下移">${svgIcon("down")}</button>` +
    `</div>`;
}

function honorActions() {
  return `<span class="honor-actions">` +
    `<button class="move-btn" data-move="up" title="上移">${svgIcon("up")}</button>` +
    `<button class="move-btn" data-move="down" title="下移">${svgIcon("down")}</button>` +
    `<button class="del-btn" title="删除">×</button>` +
    `</span>`;
}

export function skillTagsHTML(value) {
  const parts = String(value == null ? "" : value)
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => `<span class="skill-tag">${esc(p)}</span>`).join("");
}

function readSkillValue(el) {
  const tags = el.querySelectorAll(".skill-tag");
  if (tags.length) {
    return Array.from(tags).map((t) => t.textContent.trim()).filter(Boolean).join("、");
  }
  const clone = el.cloneNode(true);
  clone.querySelectorAll("b, .del-btn").forEach((n) => n.remove());
  return clone.textContent.trim();
}

export function renderSkillText(el) {
  const b = el.querySelector("b");
  const label = b ? b.textContent.trim() : "";
  const value = readSkillValue(el);
  el.innerHTML = `<b>${esc(label)}</b><span class="skill-tags">${skillTagsHTML(value)}</span>`;
}

export function itemMarkup(it) {
  const bullets = it.bullets.length
    ? `<ul class="item-desc" contenteditable="true">${it.bullets.map((b) => `<li>${inlineMd(b)}</li>`).join("")}</ul>`
    : "";
  const kws = (it.keywords && it.keywords.length)
    ? `<div class="item-kw"><span class="kw-label">关键词</span><span class="item-kw-text" contenteditable="true">${keywordsHTML(it.keywords)}</span></div>`
    : "";
  return `<div class="item${it.date ? " has-date" : ""}">
    ${itemActions(true)}
    <div class="item-row">
      <div>
        <div class="item-title" contenteditable="true">${inlineMd(it.title)}</div>
        ${it.sub ? `<div class="item-sub" contenteditable="true">${inlineMd(it.sub)}</div>` : ""}
      </div>
      ${it.date ? `<div class="item-date" contenteditable="true">${esc(it.date)}</div>` : ""}
    </div>
    ${kws}
    ${bullets}
  </div>`;
}

export function moveSibling(el, cls, dir) {
  const parent = el.parentElement;
  const sib = dir === "up" ? el.previousElementSibling : el.nextElementSibling;
  if (!sib || !sib.classList.contains(cls)) return;
  if (dir === "up") parent.insertBefore(el, sib);
  else parent.insertBefore(sib, el);
}

export function renderResume(data) {
  const page = getPage();
  const contacts = data.contacts
    .map((c) => `<span class="c-wrap">${svgIcon(LABEL_ICON[c.label] || "dot")}<span class="c" data-label="${esc(c.label)}" contenteditable="true">${esc(c.value)}</span><button class="del-btn" title="删除" contenteditable="false">×</button></span>`)
    .join("");

  let html = `<header class="header">${photoMarkup()}
    <div class="head-main">
      <div class="name" contenteditable="true">${esc(data.name)}</div>
      <div class="role" contenteditable="true">${esc(data.role)}</div>
      <div class="contact">${contacts}</div>
    </div>
  </header>
  <div class="content">`;

  data.sections.forEach((sec) => { html += sectionMarkup(sec); });

  html += `</div>`;
  page.innerHTML = html;
  sortDatedSections(page);
  refreshTimeline();
  renderSidePanel();
  applyHiddenSections();
}

export function sectionMarkup(sec) {
  const hasDeep = (sec.items || []).some((it) => it.bullets && it.bullets.length);
  const depthClass = hasDeep ? "depth-3" : "depth-2";
  let html = `<section class="section ${depthClass}" data-key="${esc(sec.key)}">`;
  const secIcon = `<span class="sec-ico">${svgIcon(SECTION_ICON[sec.title] || "dot")}</span>`;
  html += `<div class="section-head">${secIcon}<h2 class="section-title" contenteditable="true">${esc(sec.title)}</h2>${sectionActions()}</div>`;

  if (sec.key === "skills") {
    const skills = sec.skills
      .map((s) => `<div class="skill"><span class="skill-text" contenteditable="true"><b>${esc(s.label)}</b><span class="skill-tags">${skillTagsHTML(s.value)}</span></span><button class="del-btn" title="删除" contenteditable="false">×</button></div>`)
      .join("");
    html += `<div class="skills-grid">${skills}</div>`;
    html += `<button class="add-btn" data-tpl="skill">+ 添加技能</button>`;
  } else if (sec.key === "summary") {
    html += `<div class="item">${itemActions(false)}<p class="item-desc" contenteditable="true" style="padding-left:0;margin:0;">${inlineMd(sec.paragraphs.join(" "))}</p></div>`;
  } else if (sec.key === "honors") {
    const honors = (sec.honors || []).map((h) =>
      `<li class="honor"><span class="honor-text" contenteditable="true">${inlineMd(h)}</span>${honorActions()}</li>`
    ).join("");
    html += `<ul class="honor-list">${honors}</ul>`;
    html += `<button class="add-btn" data-tpl="honor">+ 添加荣誉</button>`;
  } else if (sec.key === "selfeval") {
    const para = sec.paragraphs.length
      ? `<p class="item-desc selfeval-para" contenteditable="true" style="padding-left:0;margin:0;">${sec.paragraphs.map(inlineMd).join("<br>")}</p>`
      : "";
    const bullets = (sec.bullets || []).map((b) =>
      `<li class="honor"><span class="honor-text" contenteditable="true">${inlineMd(b)}</span>${honorActions()}</li>`
    ).join("");
    const list = bullets ? `<ul class="honor-list">${bullets}</ul>` : "";
    html += `<div class="item">${itemActions(false)}${para}${list}</div>`;
    html += `<button class="add-btn" data-tpl="selfeval">+ 添加要点</button>`;
  } else if (sec.key === "intent") {
    const fields = (sec.fields || []).map((f) =>
      `<div class="intent-item"><span class="intent-label" contenteditable="true">${esc(f.label)}</span><span class="intent-value" contenteditable="true">${inlineMd(f.value)}</span><button class="del-btn" title="删除" contenteditable="false">×</button></div>`
    ).join("");
    html += `<div class="intent-grid">${fields}</div>`;
    html += `<button class="add-btn" data-tpl="intent">+ 添加意向</button>`;
  } else {
    html += sec.items.map(itemMarkup).join("");
    html += `<button class="add-btn" data-tpl="${esc(sec.key)}">+ 添加条目</button>`;
  }

  html += `</section>`;
  return html;
}

const DEFAULT_SECTION_BODY = {
  summary: "请在此填写个人简介。",
  selfeval: "- 要点一\n- 要点二",
  experience: "### 公司名称 · 职位名称\n2024.01 – 至今\n- 工作内容与成果。",
  projects: "### 项目名称 · 担任角色\n2024.01 – 2024.06\n- 项目描述与成果。",
  education: "### 学校名称 · 专业 · 学历\n2019.09 – 2023.06",
  certificates: "### 证书名称 · 颁发机构\n2024.06",
  honors: "- 荣誉名称",
  skills: "- **分类**：技能关键词",
  intent: "- 意向岗位：工程师",
  custom: "- 内容",
};

export function sectionExists(title) {
  return !!Array.from(getPage().querySelectorAll(".content > section")).find((sec) => {
    const t = sec.querySelector(".section-title");
    return (t ? t.textContent.trim() : "") === title;
  });
}

export function addSection(title) {
  const key = SECTION_KEYS[title] || ("custom-" + Date.now());
  const body = DEFAULT_SECTION_BODY[key] || DEFAULT_SECTION_BODY.custom;
  const parsed = parseMarkdown("## " + title + "\n\n" + body + "\n").sections[0];
  parsed.title = title;
  parsed.key = key;
  const content = getPage().querySelector(".content");
  if (!content) return;
  content.insertAdjacentHTML("beforeend", sectionMarkup(parsed));
  sortDatedSections(getPage());
  refreshTimeline();
  renderSidePanel();
  applyHiddenSections();
}

export function applyHiddenSections() {
  const page = getPage();
  if (!page) return;
  const hidden = state.settings.hiddenSections || [];
  page.querySelectorAll(".content > section").forEach((sec) => {
    const t = sec.querySelector(".section-title");
    const title = t ? t.textContent.trim() : "";
    sec.classList.toggle("sec-hidden", hidden.includes(title));
  });
}

function sideRowHTML(title, checked, order, total) {
  const icon = SECTION_ICON[title] ? svgIcon(SECTION_ICON[title]) : svgIcon("dot");
  const num = order != null
    ? `<input type="number" class="side-order" data-title="${esc(title)}" min="1" max="${total}" value="${order}" title="输入序号调整顺序" />`
    : `<span class="side-order side-order-empty"></span>`;
  return `<div class="side-row">${num}<label class="side-item"><input type="checkbox" data-title="${esc(title)}"${checked ? " checked" : ""} />${icon}<span>${esc(title)}</span></label></div>`;
}

export function renderSidePanel() {
  const list = document.getElementById("sideList");
  if (!list) return;
  const page = getPage();
  const hidden = state.settings.hiddenSections || [];
  const secs = Array.from(page.querySelectorAll(".content > section"));
  const presentTitles = secs.map((sec) => {
    const t = sec.querySelector(".section-title");
    return t ? t.textContent.trim() : "";
  });
  const presentSet = new Set(presentTitles);
  const rows = [];
  presentTitles.forEach((title, i) => {
    rows.push(sideRowHTML(title, !hidden.includes(title), i + 1, secs.length));
  });
  const extras = SECTION_CATALOG.filter((c) => !presentSet.has(c.title));
  if (extras.length) {
    rows.push(`<div class="side-sep">可添加</div>`);
    extras.forEach((c) => rows.push(sideRowHTML(c.title, false, null, secs.length)));
  }
  list.innerHTML = rows.join("");
}

export function moveSectionTo(title, pos) {
  const content = getPage().querySelector(".content");
  if (!content) return;
  const secs = Array.from(content.querySelectorAll(":scope > section"));
  const from = secs.findIndex((s) => {
    const t = s.querySelector(".section-title");
    return (t ? t.textContent.trim() : "") === title;
  });
  if (from < 0) return;
  let to = parseInt(pos, 10);
  if (isNaN(to)) return;
  to = Math.max(1, Math.min(secs.length, to)) - 1;
  const [el] = secs.splice(from, 1);
  secs.splice(to, 0, el);
  secs.forEach((s) => content.appendChild(s));
  renderSidePanel();
}

function parseStartKey(dateStr) {
  const m = String(dateStr == null ? "" : dateStr).match(/^\s*(\d{4})[.\-/年]?(\d{1,2})?/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = m[2] ? parseInt(m[2], 10) : 1;
  return y * 100 + mo;
}

function sortOneSection(sec) {
  const items = Array.from(sec.querySelectorAll(":scope > .item"));
  if (items.length < 2) return;
  const dated = items.filter((it) => {
    const d = it.querySelector(".item-date");
    return d && d.textContent.trim();
  });
  if (dated.length !== items.length) return;
  const keyed = items.map((it) => ({
    el: it,
    key: parseStartKey(it.querySelector(".item-date").textContent),
  }));
  if (keyed.some((k) => k.key == null)) return;
  keyed.sort((a, b) => b.key - a.key);
  const addBtn = sec.querySelector(":scope > .add-btn");
  keyed.forEach(({ el }) => sec.insertBefore(el, addBtn));
}

export function sortDatedSections(root) {
  const scope = root || getPage();
  if (!scope) return;
  const sections = scope.classList && scope.classList.contains("section")
    ? [scope]
    : Array.from(scope.querySelectorAll(".content > section"));
  sections.forEach(sortOneSection);
}

export function refreshTimeline() {
  const page = getPage();
  if (!page) return;
  const enabled = !!state.settings.timeline;
  const types = state.settings.timelineTypes || [];
  page.querySelectorAll(".content > section").forEach((sec) => {
    const key = sec.dataset.key;
    const datedCount = sec.querySelectorAll(".item.has-date").length;
    sec.classList.toggle("timeline-on", enabled && types.includes(key) && datedCount >= 2);
  });
}

export function renderTimelineTypes() {
  const box = document.getElementById("timelineTypes");
  if (!box) return;
  const on = !!state.settings.timeline;
  box.style.display = on ? "" : "none";
  if (!on) return;
  const types = state.settings.timelineTypes || [];
  box.innerHTML = Object.keys(TYPE_LABELS).map((k) =>
    `<button class="chip${types.includes(k) ? " active" : ""}" data-key="${k}">${TYPE_LABELS[k]}</button>`
  ).join("");
}

export function syncEditableState() {
  const page = getPage();
  if (!page) return;
  const editing = document.body.classList.contains("editing");
  page.querySelectorAll("[contenteditable]").forEach((el) => {
    if (el.tagName === "BUTTON") return;
    el.setAttribute("contenteditable", editing ? "true" : "false");
  });
}
