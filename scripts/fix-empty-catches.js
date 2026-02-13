const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const IGNORED_DIRS = ['node_modules', '.git'];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.includes(e.name)) continue;
      walk(path.join(dir, e.name));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(e.name)) continue;
    const fp = path.join(dir, e.name);
    transformFile(fp);
  }
}

function transformFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const original = src;

  // 1) catch (...) { /* maybe comment-only */ }
  src = src.replace(/catch\s*\(\s*([_$A-Za-z][\w$]*)\s*\)\s*\{\s*\*\/[^}]*?\*\/\s*\}/g, (m, p1) => {
    return `catch (${p1}) {\n  // previously intentionally empty — now logged for visibility\n  console.debug('[auto] swallowed error', ${p1});\n}`;
  });

  // 2) catch (anything) {}  -> add a console.debug
  src = src.replace(/catch\s*\(\s*([_$A-Za-z][\w$]*)\s*\)\s*\{\s*\}/g, (m, p1) => {
    return `catch (${p1}) {\n  // previously intentionally empty — now logged for visibility\n  console.debug('[auto] swallowed error', ${p1});\n}`;
  });

  // 3) catch { } (no binding) -> add binding `err`
  src = src.replace(/catch\s*\{\s*\}/g, () => {
    return `catch (err) {\n  // previously intentionally empty — now logged for visibility\n  console.debug('[auto] swallowed error', err);\n}`;
  });

  // 4) comment-only catches like catch (_) { /* ignore */ }
  src = src.replace(/catch\s*\(\s*([_$A-Za-z][\w$]*)\s*\)\s*\{\s*\/\*[^*]*\*\/\s*\}/g, (m, p1) => {
    return `catch (${p1}) {\n  // previously intentionally empty — now logged for visibility\n  console.debug('[auto] swallowed error', ${p1});\n}`;
  });

  if (src !== original) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log('[fix-empty-catches] updated:', filePath);
  }
}

walk(ROOT);
console.log('[fix-empty-catches] done');
