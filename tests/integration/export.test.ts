import { describe, test, expect } from "bun:test";
import { createTestMemDb, insertTestObservation } from "../helpers/test-db";
import { queryObservations } from "../../src/core/mem-db";
import { matchesFilter } from "../../src/core/filter";
import { EXPORT_JSON_VERSION, PACKAGE_VERSION } from "../../src/core/constants";
import type { ExportFile } from "../../src/types/observation";

describe("Export pipeline integration", () => {
  test("queries observations, filters, and produces valid JSON export", () => {
    const db = createTestMemDb();

    // Insert a mix of observations
    insertTestObservation(db, {
      type: "decision",
      title: "Use React for frontend",
      narrative: "Decided to #shared use React",
      created_at_epoch: 1710000000,
      project: "test-project",
    });
    insertTestObservation(db, {
      type: "bugfix",
      title: "Fix null pointer",
      narrative: "Fixed a critical bug",
      created_at_epoch: 1710001000,
      project: "test-project",
    });
    insertTestObservation(db, {
      type: "change",
      title: "Updated readme",
      narrative: "Minor change",
      created_at_epoch: 1710002000,
      project: "test-project",
    });
    insertTestObservation(db, {
      type: "decision",
      title: "Different project obs",
      narrative: "Not relevant",
      created_at_epoch: 1710003000,
      project: "other-project",
    });

    // Query for test-project
    const all = queryObservations(db, "test-project");
    expect(all.length).toBe(3);

    // Filter: types=["decision","bugfix"]
    const filterConfig = { types: ["decision", "bugfix"], keywords: [], tags: [] };
    const filtered = all.filter((obs) => matchesFilter(obs, filterConfig));
    expect(filtered.length).toBe(2);
    expect(filtered.map((o) => o.type).sort()).toEqual(["bugfix", "decision"]);

    // Build ExportFile
    const now = new Date();
    const exportFile: ExportFile = {
      version: EXPORT_JSON_VERSION,
      exportedBy: "test-dev",
      exportedAt: now.toISOString(),
      exportedAtEpoch: Math.floor(now.getTime() / 1000),
      project: "test-project",
      packageVersion: PACKAGE_VERSION,
      filters: filterConfig,
      observations: filtered,
      observationCount: filtered.length,
    };

    // Verify JSON structure
    expect(exportFile.version).toBe(1);
    expect(exportFile.observationCount).toBe(2);
    expect(exportFile.observations.length).toBe(2);
    expect(exportFile.exportedBy).toBe("test-dev");

    // Verify JSON is serializable
    const json = JSON.stringify(exportFile);
    const parsed = JSON.parse(json) as ExportFile;
    expect(parsed.observationCount).toBe(2);
    expect(parsed.observations[0].type).toBeDefined();

    db.close();
  });

  test("filters by tags via text search", () => {
    const db = createTestMemDb();

    insertTestObservation(db, {
      type: "discovery",
      title: "Found a pattern #shared",
      narrative: "Important discovery",
      created_at_epoch: 1710000000,
      project: "test-project",
    });
    insertTestObservation(db, {
      type: "change",
      title: "Minor change",
      narrative: "Nothing special",
      created_at_epoch: 1710001000,
      project: "test-project",
    });

    const all = queryObservations(db, "test-project");
    const filtered = all.filter((obs) =>
      matchesFilter(obs, { types: [], keywords: [], tags: ["#shared"] }),
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toContain("#shared");

    db.close();
  });

  test("empty filters export nothing", () => {
    const db = createTestMemDb();

    insertTestObservation(db, {
      type: "decision",
      title: "Some decision",
      project: "test-project",
    });

    const all = queryObservations(db, "test-project");
    const filtered = all.filter((obs) =>
      matchesFilter(obs, { types: [], keywords: [], tags: [] }),
    );

    expect(filtered.length).toBe(0);

    db.close();
  });
});
