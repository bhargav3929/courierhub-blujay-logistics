// Tiny structured JSON logger. Emits one JSON object per line on stdout
// (or stderr for level=error). No external dep, no async I/O. Replace with
// pino/winston later by re-implementing the Logger interface.
//
// Convention:
//   const log = getLogger('api.v1.b2b.shipments.events');
//   log.info('manual event ingest', { requestId, partnerId, shipmentId, outcome });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
    requestId?: string;
    partnerId?: string;
    shipmentId?: string;
    eventId?: string;
    outcome?: string;
    error?: string;
    [key: string]: unknown;
}

export interface Logger {
    debug(message: string, fields?: LogFields): void;
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
    error(message: string, fields?: LogFields): void;
}

class ConsoleJsonLogger implements Logger {
    constructor(private readonly scope: string) {}

    private emit(level: LogLevel, message: string, fields?: LogFields) {
        const entry: Record<string, unknown> = {
            level,
            ts: new Date().toISOString(),
            scope: this.scope,
            message,
            ...(fields ?? {}),
        };
        const line = safeStringify(entry);
        switch (level) {
            case 'error':
                console.error(line);
                break;
            case 'warn':
                console.warn(line);
                break;
            default:
                console.log(line);
                break;
        }
    }

    debug(m: string, f?: LogFields) { this.emit('debug', m, f); }
    info(m: string, f?: LogFields) { this.emit('info', m, f); }
    warn(m: string, f?: LogFields) { this.emit('warn', m, f); }
    error(m: string, f?: LogFields) { this.emit('error', m, f); }
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value, (_key, v) => (v instanceof Error ? v.message : v));
    } catch {
        return JSON.stringify({ level: 'error', message: 'log serialization failed' });
    }
}

export function getLogger(scope: string): Logger {
    return new ConsoleJsonLogger(scope);
}
