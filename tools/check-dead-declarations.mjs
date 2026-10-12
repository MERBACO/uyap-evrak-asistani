/**
 * Catches a mistake that has cost three release cycles.
 *
 * A factory function like mountPanel() runs its body top to bottom and returns
 * early; anything after the `return` is only reachable if it is a *function
 * declaration*, which hoists. A `const` or `let` written down there never gets
 * initialised, and every use of it throws "Cannot access X before
 * initialization" — at click time, not at load time, so nothing in a syntax
 * check or a smoke test sees it.
 *
 * Run: node tools/check-dead-declarations.mjs
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

let bulgular = 0;

for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  // Track the indent of the enclosing function and the line where it returns.
  let returnIndent = null;
  let returnLine = 0;

  lines.forEach((line, i) => {
    // Only a factory's closing `return { ... }` ends the function for our purposes.
    // An early `return;` inside an if-block does not, and treating it as one
    // produced twenty false alarms — which is why the first version of this
    // check got thrown away instead of fixed.
    const ret = line.match(/^(\s*)return \{/);
    if (ret && returnIndent === null) {
      returnIndent = ret[1].length;
      returnLine = i + 1;
      return;
    }
    if (returnIndent === null) return;

    // A declaration at the same indent as the return is in the same block,
    // therefore unreachable.
    const decl = line.match(/^(\s*)(const|let)\s+([A-Za-z_$][\w$]*)/);
    if (decl && decl[1].length === returnIndent) {
      console.log(
        `${path.relative(ROOT, file)}:${i + 1}  ${decl[2]} ${decl[3]} — ` +
          `${returnLine}. satırdaki return'den sonra, hiç değer almaz`
      );
      bulgular++;
    }

    // Any closing brace shallower than the return ends the block that contained
    // it — a `const` in the following catch or else branch is perfectly alive.
    const kapanis = line.match(/^(\s*)\}/);
    if (kapanis && kapanis[1].length < returnIndent) returnIndent = null;
  });
}

if (bulgular) {
  console.log(`\n${bulgular} ölü tanım bulundu.`);
  process.exit(1);
}
console.log('ölü tanım denetimi: temiz');
