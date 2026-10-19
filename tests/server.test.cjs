const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { PassThrough } = require('node:stream');
const { root } = require('./helpers.cjs');

function setup(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-test-'));
  fs.mkdirSync(path.join(directory, 'public'));
  fs.mkdirSync(path.join(directory, 'samples'));
  fs.writeFileSync(path.join(directory, 'public/index.html'), 'editor');
  const watchers = new Map(), timers = new Set();
  let handler, host;
  const server = { listen(port, address, cb) { host = address; cb(); }, address() { return { port: 5173 }; } };
  const context = vm.createContext({
    require(name) {
      if (name === 'http') return { createServer(fn) { handler = fn; return server; } };
      if (name === 'fs') return { ...fs, watch(dir, options, cb) {
        assert.ok(fs.existsSync(dir), 'directory must exist before watching');
        watchers.set(dir, cb || options); return { close() {} };
      }, ...overrides };
      return require(name);
    },
    __dirname: directory, process: { env: {} }, URL, Buffer,
    console: { log() {}, warn() {}, error() {} },
    setInterval() {}, clearTimeout,
    setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.add(timer); return timer; },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  t.after(() => { for (const timer of timers) clearTimeout(timer); fs.rmSync(directory, { recursive: true, force: true }); });
  function open(url, method = 'GET', headers = {}) {
    const req = new PassThrough();
    Object.assign(req, { url, method, headers: { host: 'localhost:5173', ...headers } });
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const res = {
      status: 200, headers: {}, body: '', headersSent: false,
      setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
      writeHead(status, headers = {}) { this.status = status; this.headersSent = true; for (const [k,v] of Object.entries(headers)) this.setHeader(k,v); },
      setTimeout() {}, write(data) { this.body += data; },
      end(data = '') { this.body += data; finish(this); },
    };
    handler(req, res);
    return { req, res, done };
  }
  async function request(url, method, body = '', headers) {
    const pending = open(url, method, headers);
    pending.req.end(body);
    return pending.done;
  }
  return { directory, watchers, host, open, request };
}

async function create(app, name = '中文') {
  const response = await app.request('/api/resumes', 'POST', JSON.stringify({ name }));
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
}

test('fresh checkout creates docs before watching and binds only loopback', t => {
  const app = setup(t);
  assert.equal(app.host, '127.0.0.1');
  assert.ok(app.watchers.has(path.join(app.directory, 'docs')));
});

test('malformed paths return 400 and subsequent requests still work', async t => {
  const app = setup(t);
  assert.equal((await app.request('/%ZZ')).status, 400);
  assert.equal((await app.request('/')).body, 'editor');
});

test('rejects foreign Host and cross-origin mutations', async t => {
  const app = setup(t);
  assert.equal((await app.request('/', 'GET', '', { host: 'evil.example' })).status, 403);
  assert.equal((await app.request('/api/resumes', 'POST', '{}', { origin: 'https://evil.example' })).status, 403);
});

test('UTF-8 chunk boundaries survive, stale writes are rejected, backups remain intact', async t => {
  const app = setup(t), created = await create(app);
  const original = await app.request('/api/resume?file=' + encodeURIComponent(created.file));
  const pending = app.open('/api/resume?file=' + encodeURIComponent(created.file), 'POST', { 'if-match': original.headers.etag });
  const data = Buffer.from('# 中文\n内容');
  pending.req.write(data.subarray(0, 3));
  pending.req.end(data.subarray(3));
  const saved = await pending.done;
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(app.directory, 'docs', created.file), 'utf8'), data.toString());
  assert.notEqual(saved.headers.etag, original.headers.etag);
  const stale = await app.request('/api/resume?file=' + encodeURIComponent(created.file), 'POST', '# old', { 'if-match': original.headers.etag });
  assert.equal(stale.status, 412);
  const backups = JSON.parse((await app.request('/api/backups?file=' + encodeURIComponent(created.file))).body).backups;
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(app.directory, 'docs/.backups', backups[0]), 'utf8'), original.body);
  assert.ok(fs.readdirSync(path.join(app.directory, 'docs')).every(name => !name.endsWith('.tmp')));
});

test('backup failure prevents destructive writes', async t => {
  const app = setup(t), created = await create(app);
  fs.writeFileSync(path.join(app.directory, 'docs/.backups'), 'blocks backup directory');
  const response = await app.request('/api/resume?file=' + encodeURIComponent(created.file), 'POST', '# changed', { 'if-match': created.revision });
  assert.equal(response.status, 500);
  const read = await app.request('/api/resume?file=' + encodeURIComponent(created.file));
  assert.equal(read.headers.etag, created.revision);
  assert.equal((await app.request('/api/resume?file=' + encodeURIComponent(created.file), 'DELETE')).status, 500);
});

test('deleted documents cannot be recreated by delayed saves', async t => {
  const app = setup(t), created = await create(app);
  const url = '/api/resume?file=' + encodeURIComponent(created.file);
  assert.equal((await app.request(url, 'DELETE')).status, 200);
  assert.equal((await app.request(url, 'POST', '# stale', { 'if-match': created.revision })).status, 412);
  assert.equal((await app.request(url)).status, 404);
});

test('debouncing delivers changes for every file', async t => {
  const app = setup(t), pending = app.open('/api/events');
  const onChange = app.watchers.get(path.join(app.directory, 'docs'));
  onChange('change', 'a.md'); onChange('change', 'b.md');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.match(pending.res.body, /"file":"a.md"/);
  assert.match(pending.res.body, /"file":"b.md"/);
  pending.req.destroy();
});

test('oversized request returns 413 without creating a document', async t => {
  const app = setup(t);
  const response = await app.request('/api/resumes', 'POST', 'a'.repeat(8 * 1024 * 1024 + 1));
  assert.equal(response.status, 413);
  assert.equal(JSON.parse((await app.request('/api/resumes')).body).files.length, 0);
});

test('backup names cannot cross document boundaries and restoration preserves the previous content', async t => {
  const app = setup(t), a = await create(app, 'a'), b = await create(app, 'a.b');
  await app.request('/api/backup?file=a.b.md', 'POST');
  const other = JSON.parse((await app.request('/api/backups?file=a.b.md')).body).backups[0];
  assert.equal(JSON.parse((await app.request('/api/backups?file=a.md')).body).backups.length, 0);
  assert.equal((await app.request('/api/restore?file=a.md&backup=' + encodeURIComponent(other), 'POST')).status, 400);
  await app.request('/api/resume?file=a.md', 'POST', '# changed', { 'if-match': a.revision });
  const backup = JSON.parse((await app.request('/api/backups?file=a.md')).body).backups[0];
  assert.equal((await app.request('/api/restore?file=a.md&backup=' + encodeURIComponent(backup), 'POST')).status, 200);
  assert.equal((await app.request('/api/resume?file=a.md')).headers.etag, a.revision);
  assert.equal((await app.request('/api/resume?file=a.b.md')).headers.etag, b.revision);
});

test('invalid JSON and escaping paths are rejected', async t => {
  const app = setup(t);
  for (const body of ['{', 'null', '{"name":123}']) {
    assert.equal((await app.request('/api/resumes', 'POST', body)).status, 400);
  }
  assert.equal((await app.request('/..%2fdocs%2fanything.md')).status, 403);
});

test('failed atomic replacement retains the original file and cleans up temporary data', async t => {
  const app = setup(t, { renameSync() { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); } });
  const created = await create(app, 'a');
  assert.equal((await app.request('/api/resume?file=a.md', 'POST', '# changed', { 'if-match': created.revision })).status, 500);
  assert.equal((await app.request('/api/resume?file=a.md')).headers.etag, created.revision);
  assert.ok(fs.readdirSync(path.join(app.directory, 'docs')).every(name => !name.endsWith('.tmp')));
});
