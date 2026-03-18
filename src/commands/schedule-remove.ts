import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { logger } from "../core/logger";
import type { ParsedArgs } from "../cli";

const TASK_NAMES = [
  "claude-mem-sync-export",
  "claude-mem-sync-import",
  "claude-mem-sync-maintain",
];

export default async function run(_args: ParsedArgs): Promise<void> {
  const platform = process.platform;

  if (platform === "linux") {
    await removeCron();
  } else if (platform === "darwin") {
    await removeLaunchd();
  } else if (platform === "win32") {
    await removeSchtasks();
  } else {
    logger.error(`Unsupported platform: ${platform}. Remove scheduled tasks manually.`);
    process.exit(1);
  }
}

async function removeCron(): Promise<void> {
  const proc = Bun.spawn(["crontab", "-l"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const existing = await new Response(proc.stdout).text();
  await proc.exited;

  // Remove all claude-mem-sync entries
  const filtered = existing
    .split("\n")
    .filter((line) => {
      return !line.includes("claude-mem-sync") && !line.includes("mem-sync");
    })
    .join("\n")
    .trim();

  const install = Bun.spawn(["crontab", "-"], {
    stdin: "pipe",
  });
  install.stdin.write(filtered ? `${filtered}\n` : "");
  install.stdin.end();
  await install.exited;

  console.log("Removed claude-mem-sync cron entries.");
}

async function removeLaunchd(): Promise<void> {
  const agentsDir = join(homedir(), "Library", "LaunchAgents");

  for (const name of TASK_NAMES) {
    const filename = `com.${name}.plist`;
    const filepath = join(agentsDir, filename);

    if (existsSync(filepath)) {
      // Unload first
      const proc = Bun.spawn(["launchctl", "unload", filepath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;

      unlinkSync(filepath);
      console.log(`Removed: ${filename}`);
    }
  }

  console.log("Removed claude-mem-sync launch agents.");
}

async function removeSchtasks(): Promise<void> {
  for (const name of TASK_NAMES) {
    const cmd = `schtasks /delete /tn "${name}" /f`;
    const proc = Bun.spawn(["cmd", "/c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      console.log(`Deleted task: ${name}`);
    } else {
      logger.warn(`Task "${name}" not found or could not be deleted.`);
    }
  }

  console.log("Removed claude-mem-sync scheduled tasks.");
}
