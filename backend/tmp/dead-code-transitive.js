// Analyse transitive du code mort : construit le graphe d'appel entre declarations
// top-level, puis marque comme vivant tout ce qui est atteignable depuis les racines.
// Racines = code hors corps de fonction (routes, consts top-level, module.exports).
// Usage: node tmp/dead-code-transitive.js routes/books.js
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'routes/books.js';
const source = fs.readFileSync(path.join(__dirname, '..', target), 'utf8');
const lines = source.split(/\r?\n/);

// 1. Reperer les declarations top-level (colonne 0)
const decls = [];
lines.forEach((line, index) => {
  const fn = line.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
  if (fn) {
    decls.push({ name: fn[1], start: index + 1, kind: 'function' });
    return;
  }
  const cst = line.match(/^const\s+([A-Za-z0-9_$]+)\s*=/);
  if (cst) {
    decls.push({ name: cst[1], start: index + 1, kind: 'const' });
  }
});

// 2. Delimiter les segments : de chaque declaration jusqu'a la suivante
decls.forEach((decl, i) => {
  decl.end = i + 1 < decls.length ? decls[i + 1].start - 1 : lines.length;
  decl.body = lines.slice(decl.start - 1, decl.end).join('\n');
});

// 3. Le prologue (avant la 1re declaration) est racine
const prologue = decls.length ? lines.slice(0, decls[0].start - 1).join('\n') : source;

const fnDecls = decls.filter((d) => d.kind === 'function');
const constDecls = decls.filter((d) => d.kind === 'const');
const fnNames = new Set(fnDecls.map((d) => d.name));

const referencedIn = (text, name) => {
  const pattern = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g');
  return pattern.test(text);
};

// 4. Racines : prologue + tous les segments const (evalues a l'import, et ils
//    englobent le code des routes situe entre deux declarations).
const rootText = [prologue, ...constDecls.map((d) => d.body)].join('\n');

const live = new Set();
const queue = [];
fnNames.forEach((name) => {
  if (referencedIn(rootText, name)) {
    live.add(name);
    queue.push(name);
  }
});

// 5. Propagation transitive
const byName = new Map(fnDecls.map((d) => [d.name, d]));
while (queue.length) {
  const current = queue.pop();
  const decl = byName.get(current);
  if (!decl) continue;
  fnNames.forEach((candidate) => {
    if (live.has(candidate) || candidate === current) return;
    if (referencedIn(decl.body, candidate)) {
      live.add(candidate);
      queue.push(candidate);
    }
  });
}

const dead = fnDecls.filter((d) => !live.has(d.name));
const deadLineCount = dead.reduce((total, d) => total + (d.end - d.start + 1), 0);

// Consts jamais references nulle part
const allText = source;
const deadConsts = constDecls.filter((d) => {
  const pattern = new RegExp(`\\b${d.name.replace(/\$/g, '\\$')}\\b`, 'g');
  const occurrences = (allText.match(pattern) || []).length;
  return occurrences <= 1;
});

console.log(`\n=== ${target} : ${lines.length} lignes ===`);
console.log(`Fonctions top-level : ${fnDecls.length}  |  vivantes : ${live.size}  |  MORTES : ${dead.length}`);
console.log(`\n--- FONCTIONS MORTES (transitif) : ${deadLineCount} lignes a supprimer ---`);
dead
  .sort((a, b) => a.start - b.start)
  .forEach((d) => {
    console.log(`  L${String(d.start).padStart(5)}-${String(d.end).padEnd(5)} (${String(d.end - d.start + 1).padStart(4)} l.)  ${d.name}`);
  });
console.log(`\n--- CONSTANTES MORTES : ${deadConsts.length} ---`);
deadConsts.forEach((d) => console.log(`  L${String(d.start).padStart(5)}  ${d.name}`));
console.log(`\nGain potentiel : ${deadLineCount} lignes (${((deadLineCount / lines.length) * 100).toFixed(1)}%)\n`);
