const test = require('node:test');
const assert = require('node:assert/strict');
const { modules } = require('./helpers.cjs');

test('settings merge fills missing defaults and never shares nested objects', async () => {
  const load = await modules();
  const state = await load('state.js');
  const { DEFAULT_SETTINGS, SETTINGS_VERSION, defaultSettings, mergeSettings } = state;

  const merged = mergeSettings({
    template: 'modern',
    sizes: { l1: 20 },
    timelineTypes: ['projects'],
    hiddenSections: ['X'],
  });
  assert.equal(merged.template, 'modern');
  assert.equal(merged.sizes.l1, 20);
  assert.equal(merged.sizes.name, DEFAULT_SETTINGS.sizes.name);
  assert.equal(merged.version, SETTINGS_VERSION);
  assert.notEqual(merged.sizes, DEFAULT_SETTINGS.sizes);
  assert.notEqual(merged.timelineTypes, DEFAULT_SETTINGS.timelineTypes);

  merged.sizes.name = 99;
  merged.timelineTypes.push('certificates');
  merged.hiddenSections.push('Y');
  assert.equal(DEFAULT_SETTINGS.sizes.name, 30);
  assert.deepEqual(Array.from(DEFAULT_SETTINGS.timelineTypes), ['experience', 'projects', 'education', 'certificates']);
  assert.deepEqual(Array.from(DEFAULT_SETTINGS.hiddenSections), []);

  const empty = mergeSettings(null);
  assert.equal(empty.sizes.l1, DEFAULT_SETTINGS.sizes.l1);
  assert.notEqual(empty.sizes, DEFAULT_SETTINGS.sizes);
  assert.notEqual(empty.timelineTypes, DEFAULT_SETTINGS.timelineTypes);

  const malformed = mergeSettings({ sizes: 'bad', timelineTypes: 'bad', hiddenSections: 'bad' });
  assert.equal(malformed.sizes.name, DEFAULT_SETTINGS.sizes.name);
  assert.deepEqual(Array.from(malformed.timelineTypes), Array.from(DEFAULT_SETTINGS.timelineTypes));
  assert.deepEqual(Array.from(malformed.hiddenSections), Array.from(DEFAULT_SETTINGS.hiddenSections));

  const first = defaultSettings();
  const second = defaultSettings();
  first.sizes.l1 = 1;
  first.timelineTypes.push('x');
  first.hiddenSections.push('y');
  assert.equal(second.sizes.l1, 15);
  assert.equal(second.timelineTypes.length, 4);
  assert.equal(second.hiddenSections.length, 0);

  assert.notEqual(state.state.settings.sizes, DEFAULT_SETTINGS.sizes);
});
