/**
 * Simple console logging utility with levels and formatting.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamps?: boolean;
  colors?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;
  private colors: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? '';
    this.timestamps = options.timestamps ?? true;
    this.colors = options.colors ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    const levelStr = level.toUpperCase().padEnd(5);
    if (this.colors) {
      parts.push(`${LOG_COLORS[level]}${levelStr}${LOG_COLORS.reset}`);
    } else {
      parts.push(levelStr);
    }

    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamps: this.timestamps,
      colors: this.colors,
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Default logger instance
export const logger = new Logger({ prefix: 'mcp' });

// Create logger for specific MCP server
export function createServerLogger(serverName: string): Logger {
  return new Logger({
    prefix: serverName,
    level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
  });
}
