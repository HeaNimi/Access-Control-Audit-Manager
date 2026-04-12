import fs from 'node:fs';
import path from 'node:path';

import { runMigrations } from './migrate';

type EnvProcess = NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

function loadEnvIfPresent(envPath: string, loadedPaths: Set<string>): void {
  const resolvedPath = path.resolve(envPath);

  if (loadedPaths.has(resolvedPath) || !fs.existsSync(resolvedPath)) {
    return;
  }

  const runtimeProcess = process as EnvProcess;

  if (typeof runtimeProcess.loadEnvFile === 'function') {
    runtimeProcess.loadEnvFile(resolvedPath);
  }

  loadedPaths.add(resolvedPath);
}

function loadEnvironment(): void {
  const loadedPaths = new Set<string>();

  loadEnvIfPresent(path.resolve(process.cwd(), '.env'), loadedPaths);
  loadEnvIfPresent(path.resolve(__dirname, '../../../../../.env'), loadedPaths);
}

function getConnectionString(): string {
  return (
    process.env.DATABASE_URL ?? 'postgres://acam:acam@localhost:5432/acam_ts'
  );
}

async function run(): Promise<void> {
  loadEnvironment();

  const result = await runMigrations({
    connectionString: getConnectionString(),
    log: (message) => process.stdout.write(`${message}\n`),
  });

  if (result.applied.length === 0) {
    process.stdout.write('Database schema is up to date.\n');
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
