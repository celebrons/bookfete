const supabase = require('../config/supabase');

const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || 60_000);
const AUTH_CACHE_MAX_ENTRIES = Number(process.env.AUTH_CACHE_MAX_ENTRIES || 2000);
const authUserCache = new Map();
const isAuthDebugEnabled = process.env.DEBUG_AUTH === '1';

const debugAuthLog = (...args) => {
  if (isAuthDebugEnabled) {
    console.log(...args);
  }
};

const getCachedUser = (token) => {
  const entry = authUserCache.get(token);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    authUserCache.delete(token);
    return null;
  }

  return entry.user;
};

const setCachedUser = (token, user) => {
  if (!token || !user?.id) {
    return;
  }

  if (authUserCache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldestKey = authUserCache.keys().next().value;
    if (oldestKey) {
      authUserCache.delete(oldestKey);
    }
  }

  authUserCache.set(token, {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS
  });
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      debugAuthLog('Auth: token missing');
      return res.status(401).json({ error: 'Token manquant' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      debugAuthLog('Auth: invalid auth header format');
      return res.status(401).json({ error: 'Format de token invalide' });
    }

    const token = parts[1];
    const cachedUser = getCachedUser(token);
    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      authUserCache.delete(token);
      debugAuthLog('Auth: invalid token', error?.message || error);
      return res.status(401).json({ error: 'Token invalide' });
    }

    setCachedUser(token, user);
    req.user = user;
    return next();
  } catch (error) {
    debugAuthLog('Auth: middleware error', error?.message || error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

if (isAuthDebugEnabled) {
  console.log('Auth middleware loaded (debug mode)');
}

module.exports = authenticate;
