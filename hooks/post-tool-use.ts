/**
 * PostToolUse hook for Claude Code.
 *
 * Reads hook payload from stdin, extracts observation IDs from the tool
 * response, and logs each access to access.db so the eviction scorer
 * can reward frequently-used observations.
 *
 * Safety: wrapped entirely in try/catch — never throws, never blocks Claude,
 * never writes to stdout (stdout goes back to Claude Code).
 */

import { openAccessDb, logAccess } from "../src/core/access-db";
import { loadConfig, getEnabledProjects } from "../src/core/config";
import { openMemDb, getObservationProjectMap } from "../src/core/mem-db";
import { LOGS_DIR, DEFAULT_CLAUDE_MEM_DB } from "../src/core/constants";
import { readAllStdin } from "../src/core/compat";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface McpContentBlock {
  type: string;
  text?: string;
}

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string | McpContentBlock[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function logError(msg: string, data?: unknown): void {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
    const ts = new Date().toISOString();
    const line = `[${ts}] [HOOK-ERROR] ${msg}${data ? " " + JSON.stringify(data) : ""}\n`;
    appendFileSync(join(LOGS_DIR, "hook-errors.log"), line);
  } catch {
    // absolutely nothing — we must not fail
  }
}

/**
 * Extract observation IDs from the tool response text.
 *
 * Strategies (in order):
 *  1. JSON-parse the response and walk for `"id": <number>` fields
 *  2. Regex fallback for `"id": 123`, `#123`, `id=123` patterns
 */
function extractObservationIds(response: string): number[] {
  const ids = new Set<number>();

  // Strategy 1: parse as JSON (response may be a JSON string or JSON object)
  try {
    const parsed = JSON.parse(response);
    walkForIds(parsed, ids);
  } catch {
    // not valid JSON — fall through to regex
  }

  // Strategy 2: regex patterns
  const patterns = [
    /"id"\s*:\s*(\d+)/g,
    /\bid[=:]\s*(\d+)/g,
    /#(\d+)\b/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      const n = Number(match[1]);
      if (n > 0 && Number.isInteger(n)) {
        ids.add(n);
      }
    }
  }

  return [...ids];
}

/** Recursively walk a parsed JSON value collecting numeric `id` fields. */
function walkForIds(value: unknown, ids: Set<number>): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) walkForIds(item, ids);
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "number" && Number.isInteger(obj.id) && obj.id > 0) {
      ids.add(obj.id);
    }
    for (const key of Object.keys(obj)) {
      walkForIds(obj[key], ids);
    }
  }
}

/**
 * Extract the project name from the MCP tool input or response.
 * claude-mem tools accept a `project` parameter and observations include a
 * `project` field — use these directly instead of guessing from cwd.
 */
function extractProjectFromInput(
  toolInput?: Record<string, unknown>,
  toolResponse?: string,
): string | null {
  // 1. Check tool_input.project (most reliable — explicitly passed by Claude)
  if (toolInput && typeof toolInput.project === "string" && toolInput.project) {
    return toolInput.project;
  }

  // 2. Check tool_response for a project field in the JSON payload
  if (toolResponse) {
    try {
      const parsed = JSON.parse(toolResponse);
      // Single observation response
      if (typeof parsed.project === "string" && parsed.project) {
        return parsed.project;
      }
      // Direct array of observations (e.g. get_observations returns [{...}])
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed.observations ?? parsed.results ?? parsed.data);
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item?.project === "string" && item.project) {
            return item.project;
          }
        }
      }
    } catch {
      // not JSON — skip
    }
  }

  return null;
}

/**
 * Normalize tool_response to a plain string.
 * Claude Code passes MCP responses as an array of content blocks:
 *   [{ "type": "text", "text": "..." }]
 * We need to extract the text from these blocks.
 */
function normalizeToolResponse(response: string | McpContentBlock[] | undefined): string | undefined {
  if (!response) return undefined;
  if (typeof response === "string") return response;
  if (Array.isArray(response)) {
    const texts = response
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text!);
    return texts.length > 0 ? texts.join("\n") : undefined;
  }
  return undefined;
}

/**
 * Determine the project name from `cwd` by matching against enabled projects
 * in the config.  Heuristic: check if cwd path contains the project name or
 * the project's `memProject` value.
 */
function resolveProject(cwd: string): string | null {
  try {
    const config = loadConfig();
    const enabled = getEnabledProjects(config);
    const normalizedCwd = cwd.replace(/\\/g, "/").toLowerCase();

    for (const name of enabled) {
      const project = config.projects[name];
      const memProject = project.memProject ?? name;

      if (
        normalizedCwd.includes(name.toLowerCase()) ||
        normalizedCwd.includes(memProject.toLowerCase())
      ) {
        return memProject;
      }
    }

    // Fallback: return the first enabled project's memProject if only one exists
    if (enabled.length === 1) {
      const name = enabled[0];
      return config.projects[name].memProject ?? name;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const raw = await readAllStdin();

  if (!raw.trim()) return;

  const input: HookInput = JSON.parse(raw);

  const toolResponse = normalizeToolResponse(input.tool_response);
  if (!toolResponse) return;

  const ids = extractObservationIds(toolResponse);
  if (ids.length === 0) return;

  const sessionId = input.session_id ?? null;
  const toolName = input.tool_name ?? "unknown";

  // 1. Fast path: tool_input.project is the most reliable source
  const explicitProject = extractProjectFromInput(input.tool_input, toolResponse);

  // 2. Build per-observation project map
  let projectMap: Map<number, string>;

  if (explicitProject) {
    // All observations share the same explicit project
    projectMap = new Map(ids.map((id) => [id, explicitProject]));
  } else {
    // Look up each observation's project from claude-mem's DB (source of truth)
    try {
      const config = loadConfig();
      const dbPath = config.global.claudeMemDbPath ?? DEFAULT_CLAUDE_MEM_DB;
      const memDb = openMemDb(dbPath);
      try {
        projectMap = getObservationProjectMap(memDb, ids);
      } finally {
        memDb.close();
      }
    } catch {
      // DB lookup failed — try cwd fallback for all IDs
      const cwdProject = resolveProject(input.cwd ?? process.cwd());
      if (!cwdProject) {
        logError("Could not resolve project", { cwd: input.cwd, tool_input: input.tool_input });
        return;
      }
      projectMap = new Map(ids.map((id) => [id, cwdProject]));
    }
  }

  if (projectMap.size === 0) {
    logError("No projects resolved for any observation ID", { ids, cwd: input.cwd });
    return;
  }

  const db = openAccessDb();
  try {
    for (const [obsId, project] of projectMap) {
      logAccess(db, obsId, project, sessionId, toolName);
    }
  } finally {
    db.close();
  }
}

try {
  await main();
} catch (err) {
  logError("Unhandled error in post-tool-use hook", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}

// Always exit cleanly
process.exit(0);
