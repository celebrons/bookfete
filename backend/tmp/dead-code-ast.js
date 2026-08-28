// Analyse AST du code mort : graphe d'appel exact entre fonctions top-level.
// Racines = tout statement top-level qui n'est pas une declaration de fonction
// (routes express, consts, module.exports...).
// Usage: node tmp/dead-code-ast.js routes/books.js
const fs = require('fs');
const path = require('path');

const acornPath = path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'acorn', 'dist', 'acorn.js');
const acorn = require(acornPath);

const target = process.argv[2] || 'routes/books.js';
const filePath = path.join(__dirname, '..', target);
const source = fs.readFileSync(filePath, 'utf8');
const totalLines = source.split(/\r?\n/).length;

const ast = acorn.parse(source, {
  ecmaVersion: 2022,
  sourceType: 'script',
  locations: true,
  allowReturnOutsideFunction: true
});

// Parcours generique de l'AST
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
    walk(node[key], visit);
  }
}

// Identifiants references dans un sous-arbre (hors cles de proprietes non calculees)
function collectIdentifiers(node) {
  const names = new Set();
  const skip = new Set();
  walk(node, (n) => {
    if (n.type === 'MemberExpression' && !n.computed && n.property) skip.add(n.property);
    if (n.type === 'Property' && !n.computed && n.key) skip.add(n.key);
  });
  walk(node, (n) => {
    if (n.type === 'Identifier' && !skip.has(n)) names.add(n.name);
  });
  return names;
}

// 1. Declarations top-level
const topLevelFunctions = new Map();
const rootStatements = [];
const topLevelConsts = [];

ast.body.forEach((stmt) => {
  if (stmt.type === 'FunctionDeclaration' && stmt.id) {
    topLevelFunctions.set(stmt.id.name, {
      name: stmt.id.name,
      node: stmt,
      startLine: stmt.loc.start.line,
      endLine: stmt.loc.end.line
    });
  } else {
    rootStatements.push(stmt);
    if (stmt.type === 'VariableDeclaration') {
      stmt.declarations.forEach((d) => {
        if (d.id?.type === 'Identifier') {
          topLevelConsts.push({ name: d.id.name, startLine: stmt.loc.start.line });
        }
      });
    }
  }
});

// 2. Racines : identifiants references depuis les statements non-fonction
const live = new Set();
const queue = [];
rootStatements.forEach((stmt) => {
  collectIdentifiers(stmt).forEach((name) => {
    if (topLevelFunctions.has(name) && !live.has(name)) {
      live.add(name);
      queue.push(name);
    }
  });
});

// 3. Propagation transitive
while (queue.length) {
  const current = queue.pop();
  const decl = topLevelFunctions.get(current);
  collectIdentifiers(decl.node).forEach((name) => {
    if (name === current) return;
    if (topLevelFunctions.has(name) && !live.has(name)) {
      live.add(name);
      queue.push(name);
    }
  });
}

const dead = [...topLevelFunctions.values()]
  .filter((d) => !live.has(d.name))
  .sort((a, b) => a.startLine - b.startLine);
const deadLines = dead.reduce((total, d) => total + (d.endLine - d.startLine + 1), 0);

// 4. Consts morts : jamais references en dehors de leur propre declaration
const constUsage = new Map(topLevelConsts.map((c) => [c.name, 0]));
const countIn = (node) => {
  collectIdentifiers(node).forEach((name) => {
    if (constUsage.has(name)) constUsage.set(name, constUsage.get(name) + 1);
  });
};
topLevelFunctions.forEach((d) => countIn(d.node));
rootStatements.forEach((stmt) => {
  if (stmt.type === 'VariableDeclaration') {
    // ne compter que les initialiseurs, pas les noms declares
    stmt.declarations.forEach((d) => d.init && countIn(d.init));
  } else {
    countIn(stmt);
  }
});
const deadConsts = topLevelConsts.filter((c) => (constUsage.get(c.name) || 0) === 0);

// 5. Rapport
console.log(`\n=== ${target} : ${totalLines} lignes (analyse AST) ===`);
console.log(`Fonctions top-level : ${topLevelFunctions.size}  |  vivantes : ${live.size}  |  MORTES : ${dead.length}`);
console.log(`\n--- FONCTIONS MORTES (transitif) : ${deadLines} lignes ---`);
dead.forEach((d) => {
  console.log(`  L${String(d.startLine).padStart(5)}-${String(d.endLine).padEnd(5)} (${String(d.endLine - d.startLine + 1).padStart(4)} l.)  ${d.name}`);
});
console.log(`\n--- CONSTANTES / IMPORTS MORTS : ${deadConsts.length} ---`);
deadConsts.forEach((c) => console.log(`  L${String(c.startLine).padStart(5)}  ${c.name}`));
console.log(`\nGain : ${deadLines} lignes sur ${totalLines} (${((deadLines / totalLines) * 100).toFixed(1)}%)\n`);

// 6. Export machine-readable pour l'etape de suppression
const outPath = path.join(__dirname, 'dead-code-report.json');
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      target,
      totalLines,
      dead: dead.map((d) => ({ name: d.name, startLine: d.startLine, endLine: d.endLine })),
      deadConsts,
      liveFunctions: [...live].sort()
    },
    null,
    2
  )
);
console.log(`Rapport ecrit : tmp/dead-code-report.json`);
