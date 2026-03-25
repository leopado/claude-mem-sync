import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { ParsedArgs } from "../cli";
import { CONFIG_PATH, DEFAULT_EXPORT_SCHEDULE, PACKAGE_VERSION } from "../core/constants";
import type { Config, ProjectConfig } from "../types/config";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : "";
    rl.question(`? ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

function askYesNo(question: string, defaultYes: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultYes ? "Y/n" : "y/N";
    rl.question(`? ${question} (${hint}): `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

export default async function run(_args: ParsedArgs): Promise<void> {
  try {
    console.log(`\nclaude-mem-sync v${PACKAGE_VERSION} — Add Project\n`);

    if (!existsSync(CONFIG_PATH)) {
      console.error(`No config file found at ${CONFIG_PATH}`);
      console.error('Run "mem-sync init" first to create your configuration.');
      process.exit(1);
    }

    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config: Config = JSON.parse(raw);

    // Project name
    let projectName = "";
    while (!projectName) {
      projectName = await ask("Project name");
      if (!projectName) {
        console.log("  Project name is required.");
        continue;
      }
      if (config.projects[projectName]) {
        console.log(`  Project "${projectName}" already exists. Use "mem-sync update-project --project ${projectName}" to modify it.`);
        projectName = "";
      }
    }

    const memProject = await ask("memProject name in DB", projectName);
    const providerAnswer = await ask("Git provider (github/gitlab/bitbucket)", "github");
    const providerType = (["github", "gitlab", "bitbucket"].includes(providerAnswer.toLowerCase())
      ? providerAnswer.toLowerCase()
      : "github") as "github" | "gitlab" | "bitbucket";

    const repo = await ask("Remote repo (owner/name)");
    if (!repo) {
      console.log("Remote repo is required. Aborting.");
      return;
    }

    const hostAnswer = providerType !== "github"
      ? await ask(`Host (leave blank for ${providerType}.com)`)
      : "";
    const host = hostAnswer || undefined;

    const branchName = await ask("Branch name", "main");

    const autoMergeAnswer = await ask("Merge strategy: auto-merge or PR review?", "auto");
    const autoMerge = autoMergeAnswer.toLowerCase() !== "pr" && autoMergeAnswer.toLowerCase() !== "pr review";

    const typesRaw = await ask("Export types (comma-separated)", "decision,bugfix,discovery");
    const types = typesRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const keywordsRaw = await ask("Export keywords (comma-separated)", "");
    const keywords = keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];

    const tagsRaw = await ask("Export tags (comma-separated)", "#shared");
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const schedule = await ask("Export schedule", DEFAULT_EXPORT_SCHEDULE);

    const projectConfig: ProjectConfig = {
      enabled: true,
      memProject: memProject !== projectName ? memProject : undefined,
      remote: {
        type: providerType,
        repo,
        branch: branchName,
        autoMerge,
        ...(host ? { host } : {}),
      },
      export: {
        types,
        keywords,
        tags,
        schedule,
      },
    };

    config.projects[projectName] = projectConfig;
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

    console.log(`\nProject "${projectName}" added to ${CONFIG_PATH}`);
    console.log("\nNext steps:");
    console.log(`  1. Preview an export:  mem-sync preview --project ${projectName}`);
    console.log(`  2. Run first export:   mem-sync export --project ${projectName}`);
    console.log("");
  } finally {
    rl.close();
  }
}
