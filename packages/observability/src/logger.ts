import pino from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'config.ADMIN_TOKEN', '*.token', '*.password'],
      censor: '[REDACTED]'
    },
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { translateTime: true, colorize: true }
          }
        : undefined
  });
}

export type Logger = ReturnType<typeof createLogger>;
