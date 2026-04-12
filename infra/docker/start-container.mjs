import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "apps", "api");
const webDir = path.join(rootDir, "apps", "web");

fs.mkdirSync(path.join(rootDir, "runtime", "logs"), { recursive: true });

function runProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options,
  });

  child.on("error", (error) => {
    process.stderr.write(`${command} failed: ${error.message}\n`);
  });

  return child;
}

async function runMigrations() {
  const shouldRun =
    !process.env.RUN_DB_MIGRATIONS ||
    ["1", "true", "yes", "on"].includes(
      process.env.RUN_DB_MIGRATIONS.trim().toLowerCase(),
    );

  if (!shouldRun) {
    process.stdout.write("Skipping database migrations.\n");
    return;
  }

  await new Promise((resolve, reject) => {
    const child = runProcess(
      "node",
      ["apps/api/dist/common/database/migrate.cli.js"],
      { cwd: rootDir },
    );

    child.once("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Migration process exited with code ${code ?? -1}.`));
    });
  });
}

function attachShutdown(children) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }

    setTimeout(() => process.exit(0), 1000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  await runMigrations();

  const api = runProcess("node", ["dist/main.js"], {
    cwd: apiDir,
    env: {
      ...process.env,
      APP_API_PORT: process.env.APP_API_PORT ?? "3001",
    },
  });

  const web = runProcess("node", [".output/server/index.mjs"], {
    cwd: webDir,
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: process.env.WEB_PORT ?? "3000",
      NITRO_HOST: "0.0.0.0",
      NITRO_PORT: process.env.WEB_PORT ?? "3000",
    },
  });

  const children = [api, web];
  attachShutdown(children);

  for (const child of children) {
    child.once("exit", (code) => {
      const normalizedCode = code ?? 0;

      for (const sibling of children) {
        if (sibling !== child && !sibling.killed) {
          sibling.kill("SIGTERM");
        }
      }

      process.exit(normalizedCode);
    });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
