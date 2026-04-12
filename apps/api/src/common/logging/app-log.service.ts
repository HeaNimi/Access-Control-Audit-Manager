import fs from 'node:fs';
import path from 'node:path';

import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';

import type { ApplicationLogEntryView } from '@acam-ts/contracts';

type ApplicationLogFilter = {
  level?: ApplicationLogEntryView['level'];
  source?: string;
};

@Injectable()
export class AppLogService extends ConsoleLogger implements LoggerService {
  readonly startedAt = new Date();
  private readonly logPath: string;

  constructor() {
    super('ACAM');

    this.logPath = path.resolve(
      process.cwd(),
      process.env.APP_LOG_PATH ?? 'runtime/logs/api.jsonl',
    );

    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
  }

  override log(message: unknown, context?: string): void {
    super.log(message, context);
    this.writeEntry('log', message, context);
  }

  override warn(message: unknown, context?: string): void {
    super.warn(message, context);
    this.writeEntry('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    super.debug(message, context);
    this.writeEntry('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    super.verbose(message, context);
    this.writeEntry('verbose', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    super.error(message, stack, context);
    this.writeEntry('error', message, context, stack ? { stack } : undefined);
  }

  info(source: string, message: string, meta?: Record<string, unknown>): void {
    this.writeEntry('log', message, source, meta);
  }

  captureException(
    source: string,
    error: unknown,
    meta?: Record<string, unknown>,
  ): void {
    const message = this.formatLogMessage(error);
    const stack = error instanceof Error ? error.stack : undefined;

    super.error(message, stack, source);
    this.writeEntry('error', message, source, {
      ...meta,
      ...(stack ? { stack } : {}),
    });
  }

  getLogPath(): string {
    return this.logPath;
  }

  paginate(page = 1, pageSize = 50, filters: ApplicationLogFilter = {}) {
    const normalizedPageSize = Math.max(1, Math.min(pageSize, 200));
    const allEntries = this.filterEntries(
      this.readEntriesNewestFirst(),
      filters,
    );
    const totalEntries = allEntries.length;
    const totalPages = Math.max(
      1,
      Math.ceil(totalEntries / normalizedPageSize),
    );
    const normalizedPage = Math.max(1, Math.min(page, totalPages));
    const start = (normalizedPage - 1) * normalizedPageSize;
    const end = start + normalizedPageSize;

    return {
      path: this.logPath,
      entries: allEntries.slice(start, end),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalEntries,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    };
  }

  tail(lines = 200): ApplicationLogEntryView[] {
    return this.readEntriesNewestFirst().slice(
      0,
      Math.max(1, Math.min(lines, 500)),
    );
  }

  private readEntriesNewestFirst(): ApplicationLogEntryView[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    const content = fs.readFileSync(this.logPath, 'utf8');
    const rawLines = content.split(/\r?\n/).filter(Boolean);

    return rawLines
      .map((line) => {
        try {
          return JSON.parse(line) as ApplicationLogEntryView;
        } catch {
          return {
            timestamp: new Date().toISOString(),
            level: 'error',
            source: 'logger',
            message: line,
          } satisfies ApplicationLogEntryView;
        }
      })
      .reverse();
  }

  private filterEntries(
    entries: ApplicationLogEntryView[],
    filters: ApplicationLogFilter,
  ): ApplicationLogEntryView[] {
    const source = filters.source?.trim().toLowerCase();

    return entries.filter((entry) => {
      if (filters.level && entry.level !== filters.level) {
        return false;
      }

      if (source && !entry.source.toLowerCase().includes(source)) {
        return false;
      }

      return true;
    });
  }

  private writeEntry(
    level: ApplicationLogEntryView['level'],
    message: unknown,
    source?: string,
    meta?: Record<string, unknown>,
  ): void {
    const payload: ApplicationLogEntryView = {
      timestamp: new Date().toISOString(),
      level,
      source: source ?? 'application',
      message: this.formatLogMessage(message),
      meta,
    };

    fs.appendFileSync(this.logPath, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  private formatLogMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    if (
      message &&
      typeof message === 'object' &&
      'message' in message &&
      typeof (message as { message?: unknown }).message === 'string'
    ) {
      return (message as { message: string }).message;
    }

    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
