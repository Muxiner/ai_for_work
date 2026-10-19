const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function modules(globals = {}, stubs = {}) {
  const context = vm.createContext({ console, URLSearchParams, Response, ...globals });
  const cache = new Map();
  function get(name) {
    if (cache.has(name)) return cache.get(name);
    let module;
    if (stubs[name]) {
      const values = stubs[name];
      module = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, typeof value === "function" ? (...args) => values[key](...args) : value);
      }, { context, identifier: name });
    } else {
      let source = fs.readFileSync(path.join(root, 'public/js', name), 'utf8');
      if (name === 'app.js') {
        // Exercise the real handlers without booting the entire page.
        source = source.replace(/\nbindEditor\(\);[\s\S]*$/, '\nexport { enterSamplePreview, bindFileControls };');
      }
      module = new vm.SourceTextModule(source, { context, identifier: name });
    }
    cache.set(name, module);
    return module;
  }
  return async name => {
    const module = get(name);
    if (module.status === 'unlinked') await module.link(specifier => get(specifier.replace('./', '')));
    if (module.status === 'linked') await module.evaluate();
    return module.namespace;
  };
}

module.exports = { root, modules };
