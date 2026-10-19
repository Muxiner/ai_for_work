const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./helpers.cjs');

test('server and every browser module parse', () => {
  new vm.Script(fs.readFileSync(path.join(root, 'server.js'), 'utf8'));
  const directory = path.join(root, 'public/js');
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.js'))) {
    new vm.SourceTextModule(fs.readFileSync(path.join(directory, name), 'utf8'), { identifier: name });
  }
});
