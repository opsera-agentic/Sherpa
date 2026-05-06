export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  module: string;
  operation: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface LoggerOptions {
  json?: boolean;
  verbose?: boolean;
}

/** Structured logger for CLI output (human or JSON lines). */
export function createLogger(module: string, options: LoggerOptions = {}) {
  const emit = (record: LogRecord) => {
    if (options.json) {
      process.stdout.write(`${JSON.stringify(record)}\n`);
      return;
    }
    const prefix = `[${record.timestamp}] ${record.level.toUpperCase()} ${record.module} ${record.operation}`;
    const tail = record.message ? ` — ${record.message}` : '';
    const line = `${prefix}${tail}`;
    const target = record.level === 'error' || record.level === 'warn' ? process.stderr : process.stdout;
    target.write(`${line}\n`);
    if (options.verbose && record.data) {
      target.write(`${JSON.stringify(record.data, null, 2)}\n`);
    }
  };

  const stamp = () => new Date().toISOString();

  return {
    info(operation: string, message?: string, data?: Record<string, unknown>) {
      emit({
        timestamp: stamp(),
        level: 'info',
        module,
        operation,
        message,
        data,
      });
    },
    warn(operation: string, message?: string, data?: Record<string, unknown>) {
      emit({
        timestamp: stamp(),
        level: 'warn',
        module,
        operation,
        message,
        data,
      });
    },
    error(operation: string, message?: string, data?: Record<string, unknown>) {
      emit({
        timestamp: stamp(),
        level: 'error',
        module,
        operation,
        message,
        data,
      });
    },
    debug(operation: string, message?: string, data?: Record<string, unknown>) {
      if (!options.verbose) return;
      emit({
        timestamp: stamp(),
        level: 'debug',
        module,
        operation,
        message,
        data,
      });
    },
    emitStructured(record: Omit<LogRecord, 'timestamp'>) {
      emit({ ...record, timestamp: stamp() });
    },
  };
}
