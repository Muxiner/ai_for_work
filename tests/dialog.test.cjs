const test = require('node:test');
const assert = require('node:assert/strict');
const { modules } = require('./helpers.cjs');

test('dialog helpers fall back to native APIs without app dialog markup', async () => {
  const calls = [];
  const load = await modules({
    document: { getElementById: () => null },
    confirm(message) { calls.push(['confirm', message]); return true; },
    prompt(message, value) { calls.push(['prompt', message, value]); return '  名字  '; },
    alert(message) { calls.push(['alert', message]); },
  });
  const dialog = await load('dialog.js');

  assert.equal(await dialog.confirmDialog('要删除吗？'), true);
  assert.equal(await dialog.promptDialog('名称？', { value: '默认值' }), '名字');
  await dialog.alertDialog('保存失败');
  assert.deepEqual(calls, [
    ['confirm', '要删除吗？'],
    ['prompt', '名称？', '默认值'],
    ['alert', '保存失败'],
  ]);
});
