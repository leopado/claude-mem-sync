import { readFileSync, existsSync } from "fs";
import { ConfigSchema, type Config, type ProjectConfig } from "../types/config";
import { CONFIG_PATH } from "./constants";
import { logger } from "./logger";

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw);
}

export interface ResolvedProjectConfig {
  name: string;
  memProject: string;
  remote: ProjectConfig["remote"];
  export: ProjectConfig["export"];
  evictionStrategy: "hook" | "passive";
  evictionKeepTagged: string[];
  accessWindowMonths: number;
  scoringWeights: { typeWeight: number; recencyWeight: number; thirdWeight: number };
  mergeCapPerProject: number;
}

export function resolveProjectConfig(config: Config, projectName: string): ResolvedProjectConfig {
  const project = config.projects[projectName];
  if (!project) {
    throw new Error(`Project "${projectName}" not found in config`);
  }

  const eviction = project.eviction;

  return {
    name: projectName,
    memProject: project.memProject ?? projectName,
    remote: project.remote,
    export: project.export,
    evictionStrategy: eviction?.strategy ?? config.global.evictionStrategy,
    evictionKeepTagged: config.global.evictionKeepTagged,
    accessWindowMonths: eviction?.accessWindowMonths ?? 6,
    scoringWeights: eviction?.scoring ?? { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 },
    mergeCapPerProject: config.global.mergeCapPerProject,
  };
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found at ${CONFIG_PATH}. Run "mem-sync init" to create it.`
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return parseConfig(raw);
}

export function getEnabledProjects(config: Config): string[] {
  return Object.entries(config.projects)
    .filter(([, p]) => p.enabled !== false)
    .map(([name]) => name);
}

export function validateScoringWeights(weights: { typeWeight: number; recencyWeight: number; thirdWeight: number }): void {
  const sum = weights.typeWeight + weights.recencyWeight + weights.thirdWeight;
  if (Math.abs(sum - 1.0) > 0.01) {
    logger.warn(`Scoring weights sum to ${sum.toFixed(2)}, expected 1.0`, weights);
  }
}
