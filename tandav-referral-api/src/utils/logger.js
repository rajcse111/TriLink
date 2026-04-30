const winston              = require('winston');
const DailyRotateFile      = require('winston-daily-rotate-file');
const path                 = require('path');
const fs                   = require('fs');

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  transports: [
    // Console (colorized in dev)
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
      silent: process.env.NODE_ENV === 'test',
    }),

    // Rotating daily logs - errors only
    new DailyRotateFile({
      filename:    path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxSize:     '20m',
      maxFiles:    '14d',
      zippedArchive: true,
    }),

    // Combined logs
    new DailyRotateFile({
      filename:    path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize:     '50m',
      maxFiles:    '30d',
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename:    path.join(LOG_DIR, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize:     '20m',
      maxFiles:    '14d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename:    path.join(LOG_DIR, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize:     '20m',
      maxFiles:    '14d',
    }),
  ],
});

module.exports = logger;
