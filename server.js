const http = require("http");
const fs = require("fs");
const path = require("path");

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

## 教育背景

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
  try { fs.mkdirSync(RESUMES_DIR, { recursive: true }); } catch (e) {}
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
  if (base.includes("..")) return null;
  if (!/^[^\/\\:*?"<>|]+\.md$/i.test(base)) return null;
  return base;
}

function ensureBackupDir() {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

function backupName(file) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return file.replace(/\.md$/i, "") + "." + ts + ".md";
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
    const prefix = file.replace(/\.md$/i, "") + ".";
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith(".md"))
      .sort()
      .reverse();
  } catch (e) {
    return [];
  }
}

function sendJson(res, obj, code) {
  res.writeHead(code || 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8 * 1024 * 1024) req.destroy();
  });
  req.on("end", () => cb(body));
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

let watchTimer = null;
let reloadTimer = null;

try {
  fs.watch(RESUMES_DIR, (event, filename) => {
    if (!filename) return;
    const name = filename.toLowerCase();
    if (!name.endsWith(".md")) return;
    if (IGNORED_MD.has(name)) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => broadcast({ file: filename }), 150);
  });
} catch (e) {
  console.warn("简历目录监听失败：", e.message);
}

try {
  fs.watch(PUBLIC_DIR, { recursive: true }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => broadcast({ reload: true }), 150);
  });
} catch (e) {
  console.warn("前端目录监听失败：", e.message);
}

setInterval(() => {
  for (const client of sseClients) {
    try { client.write(": ping\n\n"); } catch (e) { sseClients.delete(client); }
  }
}, 20000);

/* ---------------- server ---------------- */

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://localhost");
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
      readBody(req, (body) => {
        let name = "";
        try { name = JSON.parse(body).name || ""; } catch (e) {}
        name = String(name).trim() || "新建简历";
        if (!/\.md$/i.test(name)) name += ".md";
        const safe = safeName(name);
        if (!safe) { res.writeHead(400); res.end("bad name"); return; }
        const full = path.join(RESUMES_DIR, safe);
        if (fs.existsSync(full)) { res.writeHead(409); res.end("exists"); return; }
        fs.writeFile(full, DEFAULT_MD, (err) => {
          if (err) { res.writeHead(500); res.end("write failed"); return; }
          sendJson(res, { ok: true, file: safe });
        });
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

  if (url === "/api/backup" && req.method === "POST") {
    const file = safeName(u.searchParams.get("file") || "");
    if (!file) { res.writeHead(400); res.end("bad file"); return; }
    const backup = createBackup(file);
    sendJson(res, { ok: !!backup, backup });
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
    const prefix = file.replace(/\.md$/i, "") + ".";
    if (!backup.startsWith(prefix)) { res.writeHead(400); res.end("bad backup"); return; }
    const src = path.join(BACKUP_DIR, backup);
    if (!fs.existsSync(src)) { res.writeHead(404); res.end("not found"); return; }
    createBackup(file);
    try {
      fs.copyFileSync(src, path.join(RESUMES_DIR, file));
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
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
        res.end(data);
      });
      return;
    }

    if (req.method === "POST") {
      readBody(req, (body) => {
        fs.writeFile(full, body, (err) => {
          if (err) { res.writeHead(500); res.end("write failed"); return; }
          sendJson(res, { ok: true, file });
        });
      });
      return;
    }

    if (req.method === "DELETE") {
      createBackup(file);
      fs.unlink(full, (err) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        sendJson(res, { ok: true });
      });
      return;
    }

    res.writeHead(405);
    res.end();
    return;
  }

  const rel = url === "/" ? "/index.html" : url;
  const full = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(rel)));
  if (!full.startsWith(PUBLIC_DIR)) {
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
});

server.timeout = 0;
ensureResumesDir();
server.listen(PORT, () => {
  const files = listResumes();
  console.log(`简历编辑器已启动： http://localhost:${PORT}`);
  console.log(`前端目录： ${PUBLIC_DIR}`);
  console.log(`简历目录（${files.length}）： ${RESUMES_DIR}`);
});
