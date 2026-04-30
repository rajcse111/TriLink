const rateLimit = require('express-rate-limit');
const { tooManyRequests } = require('../utils/response');

const handler = (req, res) => tooManyRequests(res, 'Too many requests. Please try again later.');

/** General API rate limiter */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),  // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
  skip: (req) => process.env.NODE_ENV === 'test',
});

/** Strict limiter for auth endpoints (login, OTP) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
  skip: (req) => process.env.NODE_ENV === 'test',
});

/** OTP-specific limiter (prevent OTP spam) */
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      2,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => tooManyRequests(res, 'OTP request limit reached. Please wait 1 minute.'),
  skip: (req) => process.env.NODE_ENV === 'test',
});

/** Withdrawal limiter */
const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => tooManyRequests(res, 'Too many withdrawal requests. Please try again in an hour.'),
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = { apiLimiter, authLimiter, otpLimiter, withdrawalLimiter };
