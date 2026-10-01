import { state, KEYS } from "./state.js";

export function photoKey() {
  return KEYS.PHOTO + ":" + (state.currentFile || "local");
}

export function applyPhoto() {
  const wrap = document.getElementById("photoWrap");
  const photo = document.getElementById("photo");
  if (!wrap || !photo) return;
  const data = localStorage.getItem(photoKey());
  if (data) {
    photo.style.backgroundImage = `url("${data}")`;
    wrap.classList.add("has-photo");
  } else {
    photo.style.backgroundImage = "";
    wrap.classList.remove("has-photo");
  }
}

export function compressImage(file, maxSize) {
  maxSize = maxSize || 480;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
