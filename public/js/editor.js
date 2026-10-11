import { state, splitKeywords, keywordsHTML, getPage } from "./state.js";
import { TEMPLATES, moveSibling, renderSkillText, sortDatedSections } from "./render.js";
import { scheduleSave } from "./persist.js";
import { applyPhoto, photoKey, compressImage } from "./photo.js";

export function bindEditor() {
  const page = getPage();
  if (!page) return;

  page.addEventListener("input", scheduleSave);

  page.addEventListener("blur", (e) => {
    const el = e.target;
    if (!el || !el.classList) return;
    if (el.classList.contains("item-kw-text")) {
      el.innerHTML = keywordsHTML(splitKeywords(el.textContent));
      scheduleSave();
      return;
    }
    if (el.classList.contains("skill-text")) {
      renderSkillText(el);
      scheduleSave();
      return;
    }
    const section = el.closest ? el.closest(".section") : null;
    if (section) {
      sortDatedSections(section);
      scheduleSave();
    }
  }, true);

  page.addEventListener("click", (e) => {
    if (document.body.classList.contains("editing")) {
      if (e.target.closest(".photo-del")) {
        e.stopPropagation();
        localStorage.removeItem(photoKey());
        applyPhoto();
        scheduleSave();
        return;
      }
      if (e.target.closest(".photo-wrap")) {
        const input = document.getElementById("photoInput");
        if (input) input.click();
        return;
      }
    }

    const add = e.target.closest(".add-btn");
    if (add) {
      const tpl = add.dataset.tpl;
      const section = add.closest(".section");
      const ensure = (sel, tag, cls) => {
        let el = section.querySelector(sel);
        if (!el) {
          el = document.createElement(tag);
          el.className = cls;
          add.parentElement.insertBefore(el, add);
        }
        return el;
      };
      let node, container = null;
      if (tpl === "skill") {
        node = document.createElement("div");
        node.className = "skill";
        node.innerHTML = TEMPLATES.skill;
        container = ensure(".skills-grid", "div", "skills-grid");
      } else if (tpl === "honor" || tpl === "selfeval") {
        node = document.createElement("li");
        node.className = "honor";
        node.innerHTML = TEMPLATES[tpl];
        container = ensure(".honor-list", "ul", "honor-list");
      } else if (tpl === "intent") {
        node = document.createElement("div");
        node.className = "intent-item";
        node.innerHTML = TEMPLATES.intent;
        container = ensure(".intent-grid", "div", "intent-grid");
      } else {
        node = document.createElement("div");
        node.className = "item";
        node.innerHTML = TEMPLATES[tpl] || TEMPLATES.experience;
      }
      if (container) container.appendChild(node);
      else add.parentElement.insertBefore(node, add);
      sortDatedSections(add.parentElement);
      scheduleSave();
      return;
    }

    const mv = e.target.closest(".move-btn");
    if (mv) {
      e.stopPropagation();
      const dir = mv.dataset.move;
      const item = mv.closest(".item");
      const honor = mv.closest(".honor");
      if (item) moveSibling(item, "item", dir);
      else if (honor) moveSibling(honor, "honor", dir);
      else {
        const section = mv.closest(".section");
        if (section) moveSibling(section, "section", dir);
      }
      sortDatedSections(mv.closest(".section"));
      scheduleSave();
      return;
    }

    const del = e.target.closest(".del-btn");
    if (del) {
      const target = del.closest(".item, .skill, .c-wrap, .honor, .intent-item");
      if (target) {
        const parent = target.parentElement;
        target.remove();
        sortDatedSections(parent);
      }
      scheduleSave();
    }
  });

  page.addEventListener("change", async (e) => {
    if (e.target.id !== "photoInput") return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      localStorage.setItem(photoKey(), dataUrl);
      applyPhoto();
      scheduleSave();
    } catch (err) {
      alert("图片读取失败，请重试。");
    }
  });
}
