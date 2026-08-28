// Enumere les routes montees sur un router Express (ou une app), a plat.
// Sert de contrat : le refactoring ne doit modifier ni les chemins, ni les
// methodes, ni le nombre de handlers de chaque route.

function collectLayers(layer, prefix, accumulator) {
  if (layer.route) {
    const routePath = `${prefix}${layer.route.path}`;
    const methods = Object.keys(layer.route.methods)
      .filter((method) => layer.route.methods[method])
      .map((method) => method.toUpperCase())
      .sort();
    methods.forEach((method) => {
      accumulator.push({
        method,
        path: routePath,
        // Nombre de handlers = middlewares + handler final (authenticate, etc.)
        handlerCount: layer.route.stack.length,
        handlerNames: layer.route.stack.map((entry) => entry.name || 'anonymous')
      });
    });
    return;
  }

  if (layer.name === 'router' && layer.handle?.stack) {
    const nested = extractPrefix(layer);
    layer.handle.stack.forEach((child) => collectLayers(child, `${prefix}${nested}`, accumulator));
  }
}

// Reconstitue le prefixe d'un sous-router depuis sa regexp de montage.
function extractPrefix(layer) {
  if (typeof layer.path === 'string') return layer.path;
  const source = layer.regexp?.source || '';
  if (source === '^\\/?(?=\\/|$)') return '';
  const match = source.match(/^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/);
  if (!match) return '';
  return `/${match[1].replace(/\\\//g, '/')}`;
}

function listRoutes(routerOrApp) {
  const stack = routerOrApp?.stack || routerOrApp?._router?.stack || routerOrApp?.router?.stack;
  if (!stack) {
    throw new Error('listRoutes: aucune pile de routes trouvee sur cet objet');
  }
  const accumulator = [];
  stack.forEach((layer) => collectLayers(layer, '', accumulator));
  return accumulator;
}

// Signature stable et lisible, utilisable dans un test d'egalite.
function routeSignatures(routerOrApp) {
  return listRoutes(routerOrApp)
    .map((route) => `${route.method} ${route.path}`)
    .sort();
}

module.exports = { listRoutes, routeSignatures };
