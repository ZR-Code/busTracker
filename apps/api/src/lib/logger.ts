type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold: Level = process.env.NODE_ENV === 'test' ? 'warn' : ((process.env.LOG_LEVEL as Level) ?? 'info');

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (order[level] < order[threshold]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
};
