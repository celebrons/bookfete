// Analyse ponctuelle : detecte les fonctions/constantes declarees mais jamais referencees
// ailleurs dans le meme fichier. Usage: node tmp/dead-code-scan.js routes/books.js
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'routes/books.js';
const source = fs.readFileSync(path.join(__dirname, '..', target), 'utf8');
const lines = source.split(/\r?\n/);

const declarations = [];
lines.forEach((line, index) => {
  const fn = line.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
  if (fn) {
    declarations.push({ name: fn[1], line: index + 1, kind: 'function' });
    return;
  }
  const cst = line.match(/^const\s+([A-Za-z0-9_$]+)\s*=/);
  if (cst) {
    declarations.push({ name: cst[1], line: index + 1, kind: 'const' });
  }
});

// Compte les references en excluant la ligne de declaration elle-meme.
const results = declarations.map((decl) => {
  const pattern = new RegExp(`\\b${decl.name.replace(/\$/g, '\\$')}\\b`, 'g');
  let refs = 0;
  const refLines = [];
  lines.forEach((line, index) => {
    if (index + 1 === decl.line) return;
    const matches = line.match(pattern);
    if (matches) {
      refs += matches.length;
      refLines.push(index + 1);
    }
  });
  return { ...decl, refs, refLines };
});

const dead = results.filter((r) => r.refs === 0);
const singleUse = results.filter((r) => r.refs === 1);

console.log(`\n=== ${target} : ${lines.length} lignes, ${declarations.length} declarations ===\n`);
console.log(`--- JAMAIS REFERENCE (${dead.length}) ---`);
dead.forEach((r) => console.log(`  L${String(r.line).padStart(5)}  ${r.kind.padEnd(8)} ${r.name}`));
console.log(`\n--- REFERENCE UNE SEULE FOIS (${singleUse.length}) ---`);
singleUse.forEach((r) => console.log(`  L${String(r.line).padStart(5)}  ${r.kind.padEnd(8)} ${r.name.padEnd(42)} <- L${r.refLines[0]}`));

// Doublons de declaration
const byName = new Map();
declarations.forEach((d) => {
  if (!byName.has(d.name)) byName.set(d.name, []);
  byName.get(d.name).push(d.line);
});
const dupes = [...byName.entries()].filter(([, ls]) => ls.length > 1);
console.log(`\n--- DECLARE PLUSIEURS FOIS (${dupes.length}) ---`);
dupes.forEach(([name, ls]) => console.log(`  ${name.padEnd(42)} lignes ${ls.join(', ')}`));
console.log('');
