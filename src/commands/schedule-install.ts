import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig } from "../core/config";
import { logger } from "../core/logger";
import { LOGS_DIR } from "../core/constants";
import {
  getDefaultEntries,
  generateCrontabEntries,
  generateLaunchdPlist,
  generateSchtasksCommand,
} from "../core/scheduler";
import type { ParsedArgs } from "../cli";

export default async function run(_args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const entries = getDefaultEntries(
    config.global.exportSchedule,
    config.global.maintenanceSchedule,
  );

  // Ensure logs directory exists
  mkdirSync(LOGS_DIR, { recursive: true });

  const platform = process.platform;

  if (platform === "linux") {
    await installCron(entries);
  } else if (platform === "darwin") {
    await installLaunchd(entries);
  } else if (platform === "win32") {
    await installSchtasks(entries);
  } else {
    logger.error(`Unsupported platform: ${platform}. Install scheduled tasks manually.`);
    process.exit(1);
  }
}

async function installCron(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  const crontab = generateCrontabEntries(entries);

  // Append to existing crontab, removing any previous claude-mem-sync entries
  const proc = Bun.spawn(["crontab", "-l"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const existing = await new Response(proc.stdout).text();
  await proc.exited;

  // Remove old entries
  const filtered = existing
    .split("\n")
    .filter((line) => {
      return !line.includes("claude-mem-sync") && !line.includes("mem-sync");
    })
    .join("\n")
    .trim();

  const newCrontab = filtered ? `${filtered}\n${crontab}\n` : `${crontab}\n`;

  // Install new crontab
  const install = Bun.spawn(["crontab", "-"], {
    stdin: "pipe",
  });
  install.stdin.write(newCrontab);
  install.stdin.end();
  await install.exited;

  console.log("Installed cron jobs:");
  console.log(crontab);
}

async function installLaunchd(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  mkdirSync(agentsDir, { recursive: true });

  for (const entry of entries) {
    const plist = generateLaunchdPlist(entry);
    const filename = `com.${entry.name}.plist`;
    const filepath = join(agentsDir, filename);

    writeFileSync(filepath, plist, "utf-8");
    logger.info(`Wrote ${filepath}`);

    // Load the agent
    const proc = Bun.spawn(["launchctl", "load", filepath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    console.log(`Loaded launch agent: ${filename}`);
  }

  console.log("\nScheduled tasks installed via launchd.");
}

async function installSchtasks(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  for (const entry of entries) {
    const cmd = generateSchtasksCommand(entry);
    logger.info(`Running: ${cmd}`);

    // schtasks requires cmd.exe on Windows
    const proc = Bun.spawn(["cmd", "/c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      logger.error(`Failed to create task "${entry.name}": ${stderr.trim()}`);
    } else {
      console.log(`Created scheduled task: ${entry.name}`);
    }
  }

  console.log("\nScheduled tasks installed via Task Scheduler.");
}
