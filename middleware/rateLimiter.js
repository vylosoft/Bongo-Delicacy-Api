const rateLimit = require("express-rate-limit");
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per windowMs
  message: {
    success: false,
    error: "Too many requests, please try again later.",
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Rate limit exceeded. Maximum 60 requests per minute allowed.",
      retryAfter: 60
    });
  }
});
module.exports = rateLimiter