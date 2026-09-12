require('dotenv').config();
const app = require('./app');
const db = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  app.listen(PORT, async () => {
    logger.info(`HIT BY HUMA POS Server running on port ${PORT}`);
    try {
      await db.connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed: ' + error.message);
    }
  });
};

process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

startServer();
