const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const RESUMES_DIR = path.join(ROOT, "docs");
const SAMPLES_DIR = path.join(ROOT, "samples");
const BACKUP_DIR = path.join(RESUMES_DIR, ".backups");
const DEFAULT_FILE = "readme.md";
const IGNORED_MD = new Set(["agent.md", "agents.md"]);

const DEFAULT_MD = `# 姓名

求职岗位 · 工作经验

电话：
邮箱：
城市：
学历：
求职情况：
期望岗位：
工作地点：
期望薪资：

## 个人简介

请在此填写个人简介。

## 工作经历

### 公司名称 · 职位名称
2024.01 – 至今
- 工作内容与成果。

## 项目经历

### 项目名称 · 担任角色
2024.01 – 2024.06
关键词：关键词1、关键词2
- 项目描述与成果。

## 教育经历

### 学校名称 · 专业 · 学历
2019.09 – 2023.06
关键词：主修课程

## 技能特长

- **分类**：技能关键词
`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

/* ---------------- helpers ---------------- */

function ensureResumesDir() {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
}

function listResumes() {
  try {
    return fs
      .readdirSync(RESUMES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .filter((f) => !IGNORED_MD.has(f.toLowerCase()))
      .filter((f) => {
        try { return fs.statSync(path.join(RESUMES_DIR, f)).isFile(); } catch (e) { return false; }
      })
      .sort((a, b) => a.localeCompare(b, "zh"));
  } catch (e) {
    return [];
  }
}

function listSamples() {
  try {
    return fs
      .readdirSync(SAMPLES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .filter((f) => {
        try { return fs.statSync(path.join(SAMPLES_DIR, f)).isFile(); } catch (e) { return false; }
      })
      .sort((a, b) => a.localeCompare(b, "zh"));
  } catch (e) {
    return [];
  }
}

function safeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  const base = path.basename(trimmed);
  if (base !== trimmed) return null;
  if (base.includes("..") || /[\x00-\x1f\x7f]/.test(base)) return null;
  if (!/^[^\/\\:*?"<>|]+\.md$/i.test(base)) return null;
  return base;
}

function ensureBackupDir() {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

function backupName(file) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return file.replace(/\.md$/i, "") + "." + ts + "-" + crypto.randomBytes(4).toString("hex") + ".md";
}

function isBackupFor(name, file) {
  const prefix = file.replace(/\.md$/i, "") + ".";
  return name.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]+)?\.md$/.test(name.slice(prefix.length));
}

function createBackup(file) {
  const src = path.join(RESUMES_DIR, file);
  if (!fs.existsSync(src)) return null;
  ensureBackupDir();
  const name = backupName(file);
  try {
    fs.copyFileSync(src, path.join(BACKUP_DIR, name));
    return name;
  } catch (e) {
    return null;
  }
}

function listBackups(file) {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => isBackupFor(f, file))
      .sort()
      .reverse();
  } catch (e) {
    return [];
  }
}

const lastAutoBackup = new Map();
function maybeAutoBackup(file) {
  const now = Date.now();
  if (now - (lastAutoBackup.get(file) || 0) < 60000) return true;
  if (!createBackup(file)) return false;
  lastAutoBackup.set(file, now);
  return true;
}

function revision(data) {
  return '"' + crypto.createHash("sha256").update(data).digest("hex") + '"';
}

function atomicWrite(full, data) {
  const temporary = full + "." + crypto.randomBytes(8).toString("hex") + ".tmp";
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, full);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (e) { if (e.code !== "ENOENT") console.error("临时文件清理失败", e.message); }
  }
}

function sendJson(res, obj, code) {
  res.writeHead(code || 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req, res, cb) {
  let body = "";
  let bytes = 0;
  let rejected = false;
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    if (rejected) return;
    bytes += Buffer.byteLength(chunk);
    if (bytes > 8 * 1024 * 1024) {
      rejected = true;
      res.writeHead(413);
      res.end("body too large");
      return;
    }
    body += chunk;
  });
  req.on("error", () => { rejected = true; });
  req.on("end", () => {
    if (rejected) return;
    try { cb(body); }
    catch (e) {
      console.error("请求处理失败", e.message);
      if (!res.headersSent) res.writeHead(500);
      res.end("internal error");
    }
  });
}

/* ---------------- SSE ---------------- */

const sseClients = new Set();

function broadcast(payload) {
  const data = JSON.stringify({ at: Date.now(), ...payload });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

const watchTimers = new Map();
ensureResumesDir();
let reloadTimer = null;

try {
  fs.watch(RESUMES_DIR, (event, filename) => {
    if (!filename) return;
    const name = filename.toLowerCase();
    if (!name.endsWith(".md")) return;
    if (IGNORED_MD.has(name)) return;
    clearTimeout(watchTimers.get(filename));
    watchTimers.set(filename, setTimeout(() => {
      watchTimers.delete(filename);
      broadcast({ file: filename });
    }, 150));
  });
} catch (e) {
  console.warn("简历目录监听失败：", e.message);
}

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => broadcast({ reload: true }), 150);
}

try {
  fs.watch(PUBLIC_DIR, { recursive: true }, scheduleReload);
} catch (e) {
  // Node 18 on Linux does not support recursive fs.watch.
  const watched = new Map();
  function watchTree(dir) {
    if (!watched.has(dir)) {
      const watcher = fs.watch(dir, (event) => {
        scheduleReload();
        if (event === "rename") {
          for (const [name, handle] of watched) {
            if (!fs.existsSync(name)) { handle.close(); watched.delete(name); }
          }
          try { watchTree(PUBLIC_DIR); } catch (error) { console.warn("目录监听更新失败", error.message); }
        }
      });
      watched.set(dir, watcher);
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) watchTree(path.join(dir, entry.name));
    }
  }
  try { watchTree(PUBLIC_DIR); }
  catch (error) { console.warn("前端目录监听失败：", error.message); }
}

setInterval(() => {
  for (const client of sseClients) {
    try { client.write(": ping\n\n"); } catch (e) { sseClients.delete(client); }
  }
}, 20000);

/* ---------------- server ---------------- */

const server = http.createServer((req, res) => {
  try { handleRequest(req, res); }
  catch (e) {
    console.error("请求处理失败", e.message);
    if (!res.headersSent) res.writeHead(e instanceof URIError || e instanceof TypeError ? 400 : 500);
    res.end("invalid request");
  }
});

function handleRequest(req, res) {
  const host = req.headers.host || "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    res.writeHead(403); res.end("invalid host"); return;
  }
  if (!["GET", "HEAD"].includes(req.method) && req.headers.origin && req.headers.origin !== "http://" + host) {
    res.writeHead(403); res.end("invalid origin"); return;
  }
  const u = new URL(req.url || "/", "http://" + host);
  const url = u.pathname;

  if (url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.setTimeout(0);
    res.write("retry: 2000\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (url === "/api/resumes") {
    if (req.method === "GET") {
      sendJson(res, { files: listResumes() });
      return;
    }
    if (req.method === "POST") {
      readBody(req, res, (body) => {
        let input;
        try { input = JSON.parse(body); }
        catch (e) { res.writeHead(400); res.end("invalid JSON"); return; }
        if (!input || Array.isArray(input) || typeof input !== "object" ||
            (input.name !== undefined && typeof input.name !== "string")) {
          res.writeHead(400); res.end("invalid name"); return;
        }
        let name = (input.name || "").trim() || "新建简历";
        if (!/\.md$/i.test(name)) name += ".md";
        const safe = safeName(name);
        if (!safe) { res.writeHead(400); res.end("bad name"); return; }
        const full = path.join(RESUMES_DIR, safe);
        if (fs.existsSync(full)) { res.writeHead(409); res.end("exists"); return; }
        fs.writeFileSync(full, DEFAULT_MD, { flag: "wx", mode: 0o600 });
        sendJson(res, { ok: true, file: safe, revision: revision(DEFAULT_MD) });
      });
      return;
    }
  }

  if (url === "/api/samples") {
    sendJson(res, { files: listSamples() });
    return;
  }

  if (url === "/api/sample") {
    const file = safeName(u.searchParams.get("file") || "");
    if (!file) { res.writeHead(400); res.end("bad file"); return; }
    fs.readFile(path.join(SAMPLES_DIR, file), (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
    });
    return;
  }

  if (url === "/api/rename" && req.method === "POST") {
    const from = safeName(u.searchParams.get("file") || "");
    let to = u.searchParams.get("to") || "";
    if (!/\.md$/i.test(to)) to += ".md";
    const toSafe = safeName(to);
    if (!from || !toSafe) { res.writeHead(400); res.end("bad name"); return; }
    const fromPath = path.join(RESUMES_DIR, from);
    const toPath = path.join(RESUMES_DIR, toSafe);
    if (!fs.existsSync(fromPath)) { res.writeHead(404); res.end("not found"); return; }
    if (fs.existsSync(toPath)) { res.writeHead(409); res.end("exists"); return; }
    try {
      fs.renameSync(fromPath, toPath);
      const oldPrefix = from.replace(/\.md$/i, "") + ".";
      const newPrefix = toSafe.replace(/\.md$/i, "") + ".";
      try {
        fs.readdirSync(BACKUP_DIR)
          .filter((f) => isBackupFor(f, from))
          .forEach((f) => {
            fs.renameSync(path.join(BACKUP_DIR, f), path.join(BACKUP_DIR, newPrefix + f.slice(oldPrefix.length)));
          });
      } catch (e) {}
    } catch (e) {
      res.writeHead(500);
      res.end("rename failed");
      return;
    }
    sendJson(res, { ok: true, file: toSafe });
    return;
  }

  if (url === "/api/backup" && req.method === "POST") {
    const file = safeName(u.searchParams.get("file") || "");
    if (!file) { res.writeHead(400); res.end("bad file"); return; }
    const backup = createBackup(file);
    sendJson(res, { ok: !!backup, backup }, backup ? 200 : 500);
    return;
  }

  if (url === "/api/backups" && req.method === "GET") {
    const file = safeName(u.searchParams.get("file") || "");
    if (!file) { res.writeHead(400); res.end("bad file"); return; }
    sendJson(res, { backups: listBackups(file) });
    return;
  }

  if (url === "/api/restore" && req.method === "POST") {
    const file = safeName(u.searchParams.get("file") || "");
    const backup = safeName(u.searchParams.get("backup") || "");
    if (!file || !backup) { res.writeHead(400); res.end("bad params"); return; }
    if (!isBackupFor(backup, file)) { res.writeHead(400); res.end("bad backup"); return; }
    const src = path.join(BACKUP_DIR, backup);
    if (!fs.existsSync(src)) { res.writeHead(404); res.end("not found"); return; }
    if (fs.existsSync(path.join(RESUMES_DIR, file)) && !createBackup(file)) {
      res.writeHead(500); res.end("backup failed"); return;
    }
    try {
      atomicWrite(path.join(RESUMES_DIR, file), fs.readFileSync(src));
    } catch (e) {
      res.writeHead(500);
      res.end("restore failed");
      return;
    }
    sendJson(res, { ok: true, file });
    return;
  }

  if (url === "/api/resume") {
    const file = safeName(u.searchParams.get("file") || DEFAULT_FILE);
    if (!file) { res.writeHead(400); res.end("bad file"); return; }
    const full = path.join(RESUMES_DIR, file);

    if (req.method === "GET") {
      fs.readFile(full, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", ETag: revision(data) });
        res.end(data);
      });
      return;
    }

    if (req.method === "POST") {
      readBody(req, res, (body) => {
        let existing;
        try { existing = fs.readFileSync(full, "utf8"); }
        catch (e) { if (e.code !== "ENOENT") throw e; }
        const expected = req.headers["if-match"] || u.searchParams.get("revision");
        if (existing === undefined || !expected || expected !== revision(existing)) {
          res.writeHead(412); res.end("file changed; reload before saving"); return;
        }
        if (existing.trim() && !String(body).trim()) {
          res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("empty content rejected");
          return;
        }
        if (existing.trim() && !maybeAutoBackup(file)) {
          res.writeHead(500); res.end("backup failed"); return;
        }
        atomicWrite(full, body);
        res.setHeader("ETag", revision(body));
        sendJson(res, { ok: true, file });
      });
      return;
    }

    if (req.method === "DELETE") {
      if (fs.existsSync(full) && !createBackup(file)) {
        res.writeHead(500); res.end("backup failed"); return;
      }
      try { fs.unlinkSync(full); }
      catch (e) {
        if (e.code !== "ENOENT") throw e;
        res.writeHead(404); res.end("not found"); return;
      }
      sendJson(res, { ok: true });
      return;
    }

    res.writeHead(405);
    res.end();
    return;
  }

  const rel = url === "/" ? "/index.html" : url;
  const full = path.resolve(PUBLIC_DIR, "." + decodeURIComponent(rel));
  const relative = path.relative(PUBLIC_DIR, full);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

server.requestTimeout = 30000;
server.listen(PORT, "127.0.0.1", () => {
  const files = listResumes();
  console.log(`简历编辑器已启动： http://localhost:${server.address().port}`);
  console.log(`前端目录： ${PUBLIC_DIR}`);
  console.log(`简历目录（${files.length}）： ${RESUMES_DIR}`);
});
