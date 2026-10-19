import { SECTION_KEYS, splitKeywords, txt } from "./state.js";

function bulletContent(t) {
  const m = t.match(/^(?:[-•·]\s*|\*\s)(.*)$/);
  return m ? m[1].trim() : null;
}

function domToMd(node) {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += n.textContent; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    const inner = domToMd(n);
    if (tag === "strong" || tag === "b") out += "**" + inner + "**";
    else if (tag === "em" || tag === "i") out += "*" + inner + "*";
    else if (tag === "code") out += "`" + inner + "`";
    else if (tag === "del" || tag === "s" || tag === "strike") out += "~~" + inner + "~~";
    else if (tag === "a") out += "[" + inner + "](" + (n.getAttribute("href") || "") + ")";
    else if (tag === "br") out += "\n";
    else out += inner;
  });
  return out;
}

function mdOf(sel, root) {
  const el = (root || document).querySelector(sel);
  return el ? domToMd(el).trim() : "";
}

export function parseMarkdown(md) {
  const data = { name: "", role: "", contacts: [], sections: [] };
  let section = null, item = null;
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (t.startsWith("### ")) {
      const parts = t.slice(4).split(" · ");
      item = { title: parts[0] || "", sub: parts.slice(1).join(" · "), date: "", keywords: [], bullets: [] };
      if (!section) {
        section = { title: "经历", key: "custom-0", items: [], skills: [], paragraphs: [], honors: [], bullets: [], fields: [] };
        data.sections.push(section);
      }
      section.items.push(item);
      continue;
    }

    if (t.startsWith("## ")) {
      const title = t.slice(3).trim();
      section = {
        title,
        key: SECTION_KEYS[title] || ("custom-" + data.sections.length),
        items: [], skills: [], paragraphs: [], honors: [], bullets: [], fields: [],
      };
      data.sections.push(section);
      item = null;
      continue;
    }

    if (t.startsWith("# ")) {
      data.name = t.slice(2).trim();
      section = null; item = null;
      continue;
    }

    if (!section) {
      const cm = t.match(/^([^:：]{1,10})\s*[:：]\s*(.*)$/);
      if (cm) { data.contacts.push({ label: cm[1].trim(), value: cm[2].trim() }); continue; }
      if (!data.role) { data.role = t; continue; }
      continue;
    }

    const bc = bulletContent(t);
    if (bc != null) {
      const content = bc;
      if (section.key === "skills") {
        const m = content.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
        section.skills.push(m ? { label: m[1], value: m[2] } : { label: "", value: content });
      } else if (section.key === "honors") {
        section.honors.push(content);
      } else if (section.key === "selfeval") {
        section.bullets.push(content);
      } else if (section.key === "intent") {
        const m = content.match(/^([^:：]{1,12})\s*[:：]\s*(.*)$/);
        section.fields.push(m ? { label: m[1].trim(), value: m[2].trim() } : { label: content, value: "" });
      } else if (item) {
        item.bullets.push(content);
      } else {
        section.paragraphs.push("- " + content);
      }
      continue;
    }

    const kwm = t.match(/^(关键词|关键字|技术栈|主修课程|标签)\s*[:：]\s*(.+)$/);
    if (kwm && item) {
      item.keywords = splitKeywords(kwm[2]);
      continue;
    }

    if (item) {
      if (!item.date && /^\d{4}/.test(t)) { item.date = t; continue; }
      item.bullets.push(t);
    } else {
      section.paragraphs.push(t);
    }
  }
  return data;
}

export function serialize() {
  const out = [];
  out.push("# " + txt(".name"), "", txt(".role"), "");
  document.querySelectorAll(".contact .c").forEach((c) => {
    out.push(`${c.dataset.label}：${c.textContent.trim()}`);
  });
  out.push("");

  document.querySelectorAll(".content > section").forEach((sec) => {
    const key = sec.dataset.key || "";
    out.push("## " + txt(".section-title", sec), "");

    if (key === "skills") {
      sec.querySelectorAll(".skill").forEach((s) => {
        const st = s.querySelector(".skill-text") || s;
        const clone = st.cloneNode(true);
        clone.querySelectorAll(".del-btn").forEach((b) => b.remove());
        const b = clone.querySelector("b");
        const label = b ? b.textContent.trim() : "";
        if (b) b.remove();
        const tags = Array.from(st.querySelectorAll(".skill-tag"))
          .map((t) => t.textContent.trim())
          .filter(Boolean);
        const value = tags.length ? tags.join("、") : clone.textContent.trim();
        out.push(`- **${label}**：${value}`);
      });
      out.push("");
      return;
    }

    if (key === "summary") {
      out.push(mdOf(".item-desc", sec), "");
      return;
    }

    if (key === "honors") {
      sec.querySelectorAll(".honor .honor-text").forEach((h) => {
        const v = domToMd(h).trim();
        if (v) out.push("- " + v);
      });
      out.push("");
      return;
    }

    if (key === "selfeval") {
      const paraText = mdOf(".selfeval-para", sec);
      if (paraText) {
        paraText.split("\n").map((s) => s.trim()).filter(Boolean).forEach((l) => out.push(l));
      }
      sec.querySelectorAll(".honor .honor-text").forEach((h) => {
        const v = domToMd(h).trim();
        if (v) out.push("- " + v);
      });
      out.push("");
      return;
    }

    if (key === "intent") {
      sec.querySelectorAll(".intent-item").forEach((it) => {
        const label = it.querySelector(".intent-label");
        const value = it.querySelector(".intent-value");
        const l = label ? label.textContent.trim() : "";
        const v = value ? domToMd(value).trim() : "";
        if (l || v) out.push("- " + l + "：" + v);
      });
      out.push("");
      return;
    }

    sec.querySelectorAll(".section-paragraph").forEach((p) => {
      const value = domToMd(p).trim();
      if (value) out.push((p.dataset.bullet === "true" ? "- " : "") + value);
    });
    out.push("");
    sec.querySelectorAll(".item").forEach((item) => {
      const title = mdOf(".item-title", item);
      const sub = mdOf(".item-sub", item);
      const date = txt(".item-date", item);
      out.push("### " + [title, sub].filter(Boolean).join(" · "));
      if (date) out.push(date);
      const kwEl = item.querySelector(".item-kw-text");
      if (kwEl) {
        const kws = splitKeywords(kwEl.textContent);
        if (kws.length) out.push("关键词：" + kws.join("、"));
      }
      item.querySelectorAll(".item-desc li").forEach((li) => out.push("- " + domToMd(li).trim()));
      out.push("");
    });
  });

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
