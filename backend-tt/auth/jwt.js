const jwt = require('jsonwebtoken');
const {
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpires,
  jwtRefreshExpires,
} = require('../config/config');

function createTokenPayload(user) {
  return {
    userId: user.id,
    username: user.username,
  };
}

function signAccessToken(user) {
  return jwt.sign(createTokenPayload(user), jwtAccessSecret, { expiresIn: jwtAccessExpires });
}

function signRefreshToken(user) {
  return jwt.sign(createTokenPayload(user), jwtRefreshSecret, { expiresIn: jwtRefreshExpires });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtAccessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, jwtRefreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
