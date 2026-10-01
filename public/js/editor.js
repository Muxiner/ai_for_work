import { state, splitKeywords, keywordsHTML, getPage } from "./state.js";
import { TEMPLATES, moveSibling, renderSkillText } from "./render.js";
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
      let node;
      if (tpl === "skill") {
        node = document.createElement("div");
        node.className = "skill";
        node.innerHTML = TEMPLATES.skill;
      } else {
        node = document.createElement("div");
        node.className = "item";
        node.innerHTML = TEMPLATES[tpl] || TEMPLATES.experience;
      }
      add.parentElement.insertBefore(node, add);
      scheduleSave();
      return;
    }

    const mv = e.target.closest(".move-btn");
    if (mv) {
      e.stopPropagation();
      const dir = mv.dataset.move;
      const item = mv.closest(".item");
      if (item) moveSibling(item, "item", dir);
      else {
        const section = mv.closest(".section");
        if (section) moveSibling(section, "section", dir);
      }
      scheduleSave();
      return;
    }

    const del = e.target.closest(".del-btn");
    if (del) {
      const target = del.closest(".item, .skill, .c-wrap");
      if (target) target.remove();
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
