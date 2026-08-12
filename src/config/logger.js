const winston = require('winston');

const estTest = process.env.NODE_ENV === 'test';
const estProd = process.env.NODE_ENV === 'production';

const formatDev = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
);

const formatProd = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports = [];
if (estProd) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
} else if (!estTest) {
  transports.push(new winston.transports.Console({ format: formatDev }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: estProd ? formatProd : formatDev,
  transports,
  silent: estTest,
});

logger.stream = { write: (message) => logger.http(message.trim()) };

module.exports = logger;
