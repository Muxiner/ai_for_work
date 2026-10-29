let els = null;
let active = null;

function refs() {
  if (els) return els;
  const dialog = document.getElementById("appDialog");
  if (!dialog || typeof dialog.showModal !== "function") return null;
  els = {
    dialog,
    form: document.getElementById("appDialogForm"),
    title: document.getElementById("appDialogTitle"),
    message: document.getElementById("appDialogMessage"),
    field: document.getElementById("appDialogField"),
    label: document.getElementById("appDialogLabel"),
    input: document.getElementById("appDialogInput"),
    error: document.getElementById("appDialogError"),
    cancel: document.getElementById("appDialogCancel"),
    ok: document.getElementById("appDialogOk"),
  };
  bind(els);
  return els;
}

function nativeFn(name) {
  const scope = typeof globalThis === "object" ? globalThis : {};
  return typeof scope[name] === "function" ? scope[name].bind(scope) : null;
}

function fallback(mode, opts) {
  if (mode === "prompt") {
    const prompt = nativeFn("prompt");
    const value = prompt ? prompt(opts.message, opts.value || "") : null;
    return value == null ? null : String(value).trim();
  }
  if (mode === "confirm") {
    const confirm = nativeFn("confirm");
    return confirm ? !!confirm(opts.message) : false;
  }
  const alert = nativeFn("alert");
  if (alert) alert(opts.message);
  return undefined;
}

function cancelValue(mode) {
  if (mode === "prompt") return null;
  if (mode === "confirm") return false;
  return undefined;
}

function finish(value) {
  if (!active) return;
  const current = active;
  active = null;
  if (els && els.dialog.open) els.dialog.close();
  document.body.classList.remove("dialog-open");
  current.resolve(value);
}

function bind(ref) {
  ref.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!active) return;
    if (active.mode === "prompt") {
      const value = ref.input.value.trim();
      if (active.opts.required !== false && !value) {
        ref.error.textContent = "请输入内容";
        ref.error.hidden = false;
        ref.input.focus();
        return;
      }
      finish(value);
      return;
    }
    finish(active.mode === "alert" ? undefined : true);
  });
  ref.cancel.addEventListener("click", () => {
    if (active) finish(cancelValue(active.mode));
  });
  ref.dialog.addEventListener("click", (e) => {
    if (e.target === ref.dialog && active) finish(cancelValue(active.mode));
  });
  ref.dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (active) finish(cancelValue(active.mode));
  });
  ref.dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (!active) return;
    const current = active;
    active = null;
    current.resolve(cancelValue(current.mode));
  });
  ref.input.addEventListener("input", () => {
    ref.error.hidden = true;
  });
}

function openDialog(mode, opts) {
  const ref = refs();
  if (!ref) return Promise.resolve(fallback(mode, opts));

  if (active) {
    const previous = active;
    active = null;
    if (ref.dialog.open) ref.dialog.close();
    previous.resolve(cancelValue(previous.mode));
  }

  return new Promise((resolve) => {
    const defaults = {
      confirm: { title: "确认", okText: "确定" },
      prompt: { title: "请输入", okText: "确定" },
      alert: { title: "提示", okText: "知道了" },
    }[mode];
    const options = { ...defaults, ...opts };

    active = { resolve, mode, opts: options };
    ref.title.textContent = options.title;
    ref.message.textContent = options.message || "";
    ref.field.hidden = mode !== "prompt";
    ref.label.textContent = options.label || "";
    ref.input.value = options.value == null ? "" : String(options.value);
    ref.input.placeholder = options.placeholder || "";
    ref.ok.textContent = options.okText;
    ref.ok.classList.toggle("danger", !!options.danger);
    ref.cancel.textContent = options.cancelText || "取消";
    ref.cancel.hidden = mode === "alert";
    ref.error.textContent = "";
    ref.error.hidden = true;

    document.body.classList.add("dialog-open");
    try {
      ref.dialog.showModal();
    } catch (e) {
      active = null;
      document.body.classList.remove("dialog-open");
      resolve(fallback(mode, options));
      return;
    }
    if (mode === "prompt") {
      ref.input.focus();
      ref.input.select();
    } else {
      ref.ok.focus();
    }
  });
}

export function confirmDialog(message, options = {}) {
  return openDialog("confirm", { ...options, message });
}

export function promptDialog(message, options = {}) {
  return openDialog("prompt", { ...options, message });
}

export function alertDialog(message, options = {}) {
  return openDialog("alert", { ...options, message });
}
