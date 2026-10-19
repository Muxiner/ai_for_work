const test = require('node:test');
const assert = require('node:assert/strict');
const { modules } = require('./helpers.cjs');

const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function setup(options = {}) {
  let view = '', status = '';
  const files = new Map([['mine.md', '# original'], ['other.md', '# other']]);
  const cache = new Map(), writes = [], listeners = {}, timers = new Map();
  const classes = new Set(['editing']);
  const controls = new Map();
  for (const id of ['fileList', 'newFileBtn', 'delFileBtn', 'toggleEdit', 'dupSampleBtn', 'exitPreviewBtn', 'renameFileBtn', 'restoreBackupBtn']) {
    controls.set(id, { addEventListener(type, fn) { listeners[id + ':' + type] = fn; }, classList: { toggle: noop } });
  }
  const api = {
    async readResume(file) { return files.get(file) ?? null; },
    async writeResume(file, md) { writes.push({ file, md }); files.set(file, md); return true; },
    async readSample() { return '# sample'; },
    async listResumes() { return [...files.keys()]; },
    acceptRevision: noop, hasConflict: () => false, beacon: noop,
  };
  const location = { search: '', reload() { location.reloaded = true; } };
  const document = {
    body: { classList: {
      contains: cls => classes.has(cls), remove: cls => classes.delete(cls), add: cls => classes.add(cls),
      toggle(cls, value) { const on = value ?? !classes.has(cls); if (on) classes.add(cls); else classes.delete(cls); return on; },
    } },
    getElementById(id) {
      if (id === 'page') return { querySelector: () => ({ textContent: 'Name' }), querySelectorAll: () => [{}] };
      if (id === 'defaultResume') return { textContent: '# default' };
      if (id === 'saveState') return { set textContent(value) { status = value; } };
      return controls.get(id) || null;
    },
    querySelectorAll: () => [],
  };
  const load = await modules({ document, location, window: { addEventListener: noop },
    localStorage: { getItem: key => cache.get(key) ?? null, setItem: (k,v) => cache.set(k,v), removeItem: k => cache.delete(k) },
    setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), setInterval: noop,
    confirm: () => options.recover || false, alert: noop, prompt: () => null,
  }, {
    'api.js': api,
    'markdown.js': { serialize: () => view, parseMarkdown: md => md },
    'render.js': { renderResume: md => { view = md; }, syncEditableState: noop, refreshTimeline: noop },
    'photo.js': { applyPhoto: noop },
    'settings.js': { renderSwatches: noop, applySettings: noop, bindControls: noop },
    'editor.js': { bindEditor: noop },
    'exporter.js': { bindExport: noop, renderImageDataUrl: noop },
  });
  const { state } = await load('state.js'); state.hasServer = true;
  const persist = await load('persist.js'); await persist.loadResume('mine.md');
  const app = await load('app.js'); app.bindFileControls();
  return { state, persist, app, api, files, cache, writes, listeners, location,
    get view() { return view; }, get status() { return status; },
    edit(md) { view = md; persist.scheduleSave(); },
    switchTo(file) { return listeners['fileList:click']({ target: { closest: () => ({ dataset: { file } }) } }); },
  };
}

test('failed saves keep dirty state, cache by file, and block switching and preview', async () => {
  const app = await setup();
  app.api.writeResume = async () => false;
  app.edit('# unsaved');
  assert.equal(await app.persist.save(), false);
  assert.equal(app.state.dirty, true);
  assert.equal(app.cache.get('resume-md-v1:mine.md'), '# unsaved');
  await app.switchTo('other.md'); await app.app.enterSamplePreview('sample.md');
  assert.equal(app.state.currentFile, 'mine.md');
  assert.equal(app.state.samplePreview, null);
  assert.equal(app.view, '# unsaved');
  await app.persist.reloadPage(); assert.equal(app.location.reloaded, undefined);
});

test('preview saves the user draft before replacing the DOM and cannot overwrite it', async () => {
  const app = await setup(); app.edit('# user draft');
  await app.app.enterSamplePreview('sample.md');
  assert.equal(app.view, '# sample'); assert.equal(app.state.dirty, false);
  await app.switchTo('other.md');
  assert.equal(app.files.get('mine.md'), '# user draft');
  assert.equal(app.view, '# other'); assert.equal(app.state.samplePreview, null);
  assert.equal(app.writes.length, 1);
});

test('a failed read preserves the active document instead of loading another cache', async () => {
  const app = await setup(); app.cache.set('resume-md-v1', '# legacy A');
  app.api.readResume = async () => null;
  assert.equal(await app.persist.loadResume('other.md'), false);
  assert.equal(app.state.currentFile, 'mine.md'); assert.equal(app.view, '# original');
});

test('out-of-order loads cannot replace the latest selected document', async () => {
  const app = await setup(), first = deferred();
  app.api.readResume = async file => file === 'slow.md' ? first.promise : '# latest';
  const slow = app.persist.loadResume('slow.md');
  await app.persist.loadResume('latest.md'); first.resolve('# obsolete'); await slow;
  assert.equal(app.state.currentFile, 'latest.md'); assert.equal(app.view, '# latest');
});

test('edits made during loading are preserved', async () => {
  const app = await setup(), pending = deferred(); app.api.readResume = () => pending.promise;
  const loading = app.persist.loadResume('other.md'); app.edit('# new edit');
  pending.resolve('# other'); assert.equal(await loading, false);
  assert.equal(app.view, '# new edit'); assert.equal(app.state.currentFile, 'mine.md');
});

test('edits during a save stay dirty and saves are serialized', async () => {
  const app = await setup(), pending = deferred(); let active = 0, maximum = 0;
  app.api.writeResume = async (file, md) => {
    maximum = Math.max(maximum, ++active); app.writes.push({file, md});
    if (app.writes.length === 1) await pending.promise;
    app.files.set(file, md); active--; return true;
  };
  app.edit('# first'); const first = app.persist.save();
  app.edit('# second'); const second = app.persist.save();
  pending.resolve(); await Promise.all([first, second]);
  assert.equal(maximum, 1); assert.equal(app.files.get('mine.md'), '# second');
  assert.equal(app.state.dirty, false);
});

test('nosync prevents automatic saves and preview mutations', async () => {
  const app = await setup(); app.location.search = '?nosync=1';
  app.edit('# readonly'); assert.equal(await app.persist.save(), false);
  assert.equal(app.writes.length, 0); assert.equal(app.state.dirty, false);
});

test('external sync cannot advance the revision while local edits are dirty', async () => {
  const app = await setup(); let accepted = false;
  app.api.acceptRevision = () => { accepted = true; };
  app.edit('# mine'); app.files.set('mine.md', '# external');
  await app.persist.syncFromFile('mine.md');
  assert.equal(accepted, false); assert.equal(app.view, '# mine');
});

test('attribute escaping and custom paragraphs survive rendering', async () => {
  const load = await modules(); const state = await load('state.js');
  const markdown = await load('markdown.js'), render = await load('render.js');
  const title = 'x" onfocus="alert(1)';
  assert.equal(state.esc(title), 'x&quot; onfocus=&quot;alert(1)');
  const data = markdown.parseMarkdown('# 姓名\n## 开源贡献\n说明文字\n- 修复问题');
  const html = render.sectionMarkup(data.sections[0]);
  assert.match(html, /说明文字/); assert.match(html, /data-bullet="true"[^>]*>修复问题/);
  assert.match(render.sectionMarkup({ ...data.sections[0], key: title }), /data-key="x&quot; onfocus=&quot;alert\(1\)"/);
});

test('local-only saves retain the cached document', async () => {
  const app = await setup(); app.state.hasServer = false;
  await app.persist.loadResume(null); app.edit('# offline');
  assert.equal(await app.persist.save(), true);
  assert.equal(app.cache.get('resume-md-v1:local'), '# offline');
});

test('API keeps the accepted revision until an external read is applied', async () => {
  let revision = '"v1"', received, reads = '# original';
  const load = await modules({ location: { search: '' }, fetch: async (url, options) => {
    if (!options.method) return new Response(reads, { headers: { ETag: revision } });
    received = options.headers['If-Match'];
    return new Response('', { status: received === revision ? 200 : 412, headers: { ETag: '"next"' } });
  } });
  const api = await load('api.js'); await api.readResume('mine.md');
  revision = '"v2"'; reads = '# external'; await api.readResume('mine.md', false);
  assert.equal(await api.writeResume('mine.md', '# mine'), false);
  assert.equal(received, '"v1"'); assert.equal(api.hasConflict('mine.md'), true);
  api.acceptRevision('mine.md', '# external');
  assert.equal(await api.writeResume('mine.md', '# merged'), true);
  assert.equal(received, '"v2"'); assert.equal(api.hasConflict('mine.md'), false);
});

test('nosync blocks every API mutation, including beacon', async () => {
  let calls = 0;
  const load = await modules({ location: { search: '?nosync=1' },
    fetch: async () => { calls++; return new Response('{}'); },
    navigator: { sendBeacon() { calls++; } },
  });
  const api = await load('api.js');
  await api.createResume('test'); await api.writeResume('test.md', '# test');
  await api.deleteResume('test.md'); await api.renameResume('test.md', 'next.md');
  await api.restoreBackup('test.md', 'backup.md'); await api.backupResume('test.md');
  api.beacon('test.md', '# test'); assert.equal(calls, 0);
});

test('recovering a cached draft marks it unsaved without mixing documents', async () => {
  const app = await setup({ recover: true });
  app.cache.set('resume-md-v1:other.md', '# recover me');
  assert.equal(await app.persist.loadResume('other.md'), true);
  assert.equal(app.view, '# recover me'); assert.equal(app.state.dirty, true);
  assert.equal(app.files.get('other.md'), '# other');
});

test('custom paragraph and bullet Markdown round-trips through serialization', async () => {
  const node = (text, bullet) => ({ dataset: { bullet: String(bullet) }, childNodes: [{ nodeType: 3, textContent: text }] });
  const section = { dataset: { key: 'custom-0' },
    querySelector: selector => selector === '.section-title' ? { textContent: '开源贡献' } : null,
    querySelectorAll: selector => selector === '.section-paragraph' ? [node('说明文字', false), node('修复问题', true)] : [],
  };
  const page = { querySelector: selector => ({ textContent: selector === '.name' ? '姓名' : '职位' }) };
  const load = await modules({ document: {
    getElementById: () => page,
    querySelectorAll: selector => selector === '.content > section' ? [section] : [],
  } });
  const markdown = await load('markdown.js');
  const output = markdown.serialize();
  assert.match(output, /## 开源贡献\n\n说明文字\n- 修复问题/);
  const again = markdown.parseMarkdown(output);
  assert.deepEqual(Array.from(again.sections[0].paragraphs), ['说明文字', '- 修复问题']);
});
