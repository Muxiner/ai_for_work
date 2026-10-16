const revisions = new Map();
const observed = new Map();
const conflicts = new Set();

async function request(url, options = {}) {
  if (options.method && options.method !== "GET" &&
      new URLSearchParams(location.search).has("nosync")) {
    return new Response("read-only", { status: 403 });
  }
  try { return await fetch(url, options); }
  catch (e) { return new Response("network error", { status: 503 }); }
}

export function hasConflict(file) { return conflicts.has(file); }

export function acceptRevision(file, md) {
  const latest = observed.get(file);
  if (latest && latest.md === md) {
    revisions.set(file, latest.revision);
    conflicts.delete(file);
  }
}

export async function listResumes() {
  const res = await request("/api/resumes", { cache: "no-store" });
  if (!res.ok) throw new Error("list failed");
  const data = await res.json();
  return data.files || [];
}

export async function listSamples() {
  const res = await request("/api/samples", { cache: "no-store" });
  if (!res.ok) throw new Error("list failed");
  const data = await res.json();
  return data.files || [];
}

export async function readSample(file) {
  const res = await request("/api/sample?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return null;
  return await res.text();
}

export async function backupResume(file) {
  const res = await request("/api/backup?file=" + encodeURIComponent(file), { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.backup || null;
}

export async function listBackups(file) {
  const res = await request("/api/backups?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.backups || [];
}

export async function restoreBackup(file, backup) {
  const res = await request(
    "/api/restore?file=" + encodeURIComponent(file) + "&backup=" + encodeURIComponent(backup),
    { method: "POST" }
  );
  return res.ok;
}

export async function readResume(file, accept = true) {
  const res = await request("/api/resume?file=" + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) return null;
  const md = await res.text();
  observed.set(file, { md, revision: res.headers.get("ETag") });
  if (accept) acceptRevision(file, md);
  return md;
}

export async function writeResume(file, md) {
  const res = await request("/api/resume?file=" + encodeURIComponent(file), {
    method: "POST",
    headers: { "Content-Type": "text/markdown; charset=utf-8", "If-Match": revisions.get(file) || "" },
    body: md,
  });
  if (res.ok) { revisions.set(file, res.headers.get("ETag")); conflicts.delete(file); }
  else if (res.status === 409 || res.status === 412) conflicts.add(file);
  return res.ok;
}

export async function createResume(name) {
  const res = await request("/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 409) return { error: "exists" };
  if (!res.ok) return { error: "failed" };
  const data = await res.json();
  revisions.set(data.file, data.revision);
  return data;
}

export async function deleteResume(file) {
  const res = await request("/api/resume?file=" + encodeURIComponent(file), { method: "DELETE" });
  return res.ok;
}

export async function renameResume(from, to) {
  const res = await request(
    "/api/rename?file=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to),
    { method: "POST" }
  );
  if (res.status === 409) return { error: "exists" };
  if (!res.ok) return { error: "failed" };
  return await res.json();
}

export function beacon(file, md) {
  if (new URLSearchParams(location.search).has("nosync") || !revisions.get(file)) return;
  try {
    navigator.sendBeacon("/api/resume?file=" + encodeURIComponent(file) + "&revision=" + encodeURIComponent(revisions.get(file)), md);
  } catch (e) {}
}

export function subscribe(onMessage) {
  if (typeof EventSource === "undefined") return null;
  const es = new EventSource("/api/events");
  es.onopen = () => onMessage({ resync: true });
  es.onmessage = (ev) => {
    let msg = {};
    try { msg = JSON.parse(ev.data) || {}; } catch (e) {}
    onMessage(msg);
  };
  return es;
}
