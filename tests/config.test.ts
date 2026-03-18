import { describe, test, expect } from "bun:test";
import { parseConfig, resolveProjectConfig, getEnabledProjects, validateScoringWeights } from "../src/core/config";

describe("parseConfig", () => {
  test("parses valid minimal config", () => {
    const raw = {
      global: { devName: "alice" },
      projects: {
        "project-alpha": {
          remote: { repo: "my-org/dev-memories" },
        },
      },
    };
    const config = parseConfig(raw);
    expect(config.global.devName).toBe("alice");
    expect(config.global.evictionStrategy).toBe("passive");
    expect(config.global.mergeCapPerProject).toBe(500);
    expect(config.projects["project-alpha"].enabled).toBe(true);
    expect(config.projects["project-alpha"].remote.branch).toBe("main");
  });

  test("rejects config without devName", () => {
    const raw = {
      global: {},
      projects: {},
    };
    expect(() => parseConfig(raw)).toThrow();
  });

  test("rejects config without projects", () => {
    const raw = { global: { devName: "alice" } };
    expect(() => parseConfig(raw)).toThrow();
  });

  test("applies defaults for optional fields", () => {
    const raw = {
      global: { devName: "bob" },
      projects: {
        test: { remote: { repo: "org/repo" } },
      },
    };
    const config = parseConfig(raw);
    expect(config.global.logLevel).toBe("info");
    expect(config.global.maintenanceSchedule).toBe("monthly");
    expect(config.global.maintenancePruneOlderThanDays).toBe(90);
    expect(config.global.maintenancePruneScoreThreshold).toBe(0.3);
    expect(config.projects.test.export.types).toEqual([]);
    expect(config.projects.test.export.tags).toEqual([]);
  });

  test("ignores $schema field", () => {
    const raw = {
      $schema: "https://example.com/schema.json",
      global: { devName: "alice" },
      projects: { test: { remote: { repo: "org/repo" } } },
    };
    const config = parseConfig(raw);
    expect(config.global.devName).toBe("alice");
  });
});

describe("resolveProjectConfig", () => {
  test("memProject defaults to key name", () => {
    const raw = {
      global: { devName: "alice" },
      projects: {
        "my-project": { remote: { repo: "org/repo" } },
      },
    };
    const config = parseConfig(raw);
    const resolved = resolveProjectConfig(config, "my-project");
    expect(resolved.memProject).toBe("my-project");
  });

  test("eviction inherits from global when not set", () => {
    const raw = {
      global: { devName: "alice", evictionStrategy: "hook" as const },
      projects: {
        test: { remote: { repo: "org/repo" } },
      },
    };
    const config = parseConfig(raw);
    const resolved = resolveProjectConfig(config, "test");
    expect(resolved.evictionStrategy).toBe("hook");
  });

  test("project eviction overrides global", () => {
    const raw = {
      global: { devName: "alice", evictionStrategy: "hook" as const },
      projects: {
        test: {
          remote: { repo: "org/repo" },
          eviction: { strategy: "passive" as const },
        },
      },
    };
    const config = parseConfig(raw);
    const resolved = resolveProjectConfig(config, "test");
    expect(resolved.evictionStrategy).toBe("passive");
  });

  test("throws for unknown project", () => {
    const raw = {
      global: { devName: "alice" },
      projects: { test: { remote: { repo: "org/repo" } } },
    };
    const config = parseConfig(raw);
    expect(() => resolveProjectConfig(config, "nonexistent")).toThrow('Project "nonexistent" not found');
  });
});

describe("getEnabledProjects", () => {
  test("returns only enabled projects", () => {
    const raw = {
      global: { devName: "alice" },
      projects: {
        a: { remote: { repo: "org/a" } },
        b: { enabled: false, remote: { repo: "org/b" } },
        c: { remote: { repo: "org/c" } },
      },
    };
    const config = parseConfig(raw);
    const enabled = getEnabledProjects(config);
    expect(enabled).toEqual(["a", "c"]);
  });
});
