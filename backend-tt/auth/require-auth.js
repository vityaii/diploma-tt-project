const { verifyAccessToken } = require('./jwt');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAccessToken(token);
      req.auth = { userId: payload.userId, username: payload.username };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  if (req.session?.userId) {
    req.auth = { userId: req.session.userId };
    return next();
  }

  return res.status(401).json({ error: 'Не авторизован' });
}

module.exports = { requireAuth };
