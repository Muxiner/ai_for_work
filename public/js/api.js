export async function listResumes() {
  const res = await fetch("/api/resumes", { cache: "no-store" });
  if (!res.ok) throw new Error("list failed");
  const data = await res.json();
  return data.files || [];
}

export async function listSamples() {
  const res = await fetch("/api/samples", { cache: "no-store" });
  if (!res.ok) throw new Error("list failed");
  const data = await res.json();
  return data.files || [];
}

export async function readSample(file) {
  const res = await fetch("/api/sample?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return null;
  return await res.text();
}

export async function backupResume(file) {
  const res = await fetch("/api/backup?file=" + encodeURIComponent(file), { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.backup || null;
}

export async function listBackups(file) {
  const res = await fetch("/api/backups?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.backups || [];
}

export async function restoreBackup(file, backup) {
  const res = await fetch(
    "/api/restore?file=" + encodeURIComponent(file) + "&backup=" + encodeURIComponent(backup),
    { method: "POST" }
  );
  return res.ok;
}

export async function readResume(file) {
  const res = await fetch("/api/resume?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return null;
  return await res.text();
}

export async function writeResume(file, md) {
  const res = await fetch("/api/resume?file=" + encodeURIComponent(file), {
    method: "POST",
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
    body: md,
  });
  return res.ok;
}

export async function createResume(name) {
  const res = await fetch("/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 409) return { error: "exists" };
  if (!res.ok) return { error: "failed" };
  return await res.json();
}

export async function deleteResume(file) {
  const res = await fetch("/api/resume?file=" + encodeURIComponent(file), { method: "DELETE" });
  return res.ok;
}

export function beacon(file, md) {
  try {
    navigator.sendBeacon("/api/resume?file=" + encodeURIComponent(file), md);
  } catch (e) {}
}

export function subscribe(onMessage) {
  if (typeof EventSource === "undefined") return null;
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    let msg = {};
    try { msg = JSON.parse(ev.data) || {}; } catch (e) {}
    onMessage(msg);
  };
  return es;
}
