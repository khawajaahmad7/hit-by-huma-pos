// Vercel serverless entry: mounts the Express app as a catch-all /api function.
// vercel.json rewrites every /api/* request here.
module.exports = require('../server/src/app');
