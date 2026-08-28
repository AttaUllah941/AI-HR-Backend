import winston from 'winston';
import { env, isProduction } from './env.js';

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${stack ?? message}${rest}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'zenith-hr-api' },
  format: combine(timestamp(), errors({ stack: true }), isProduction ? json() : combine(colorize(), consoleFormat)),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});
