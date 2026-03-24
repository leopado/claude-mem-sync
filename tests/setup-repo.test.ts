import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(import.meta.dir, "..", "templates");

describe("setup-repo templates", () => {
  test("all required GitHub template files exist", () => {
    expect(existsSync(join(TEMPLATES_DIR, ".gitignore.example"))).toBe(true);
    expect(existsSync(join(TEMPLATES_DIR, "github-action", "merge-memories.yml"))).toBe(true);
    expect(existsSync(join(TEMPLATES_DIR, "github-action", "distill-knowledge.yml"))).toBe(true);
  });

  test("GitLab CI template exists", () => {
    expect(existsSync(join(TEMPLATES_DIR, "gitlab-ci", "merge-memories.yml"))).toBe(true);
  });

  test("Bitbucket Pipelines template exists", () => {
    expect(existsSync(join(TEMPLATES_DIR, "bitbucket-pipelines", "merge-memories.yml"))).toBe(true);
  });

  test("shared-repo-readme.md template exists and has placeholder", () => {
    const readmePath = join(TEMPLATES_DIR, "shared-repo-readme.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("{{REPO_NAME}}");
  });

  test("shared-repo-readme.md placeholder is replaceable", () => {
    const content = readFileSync(join(TEMPLATES_DIR, "shared-repo-readme.md"), "utf-8");
    const replaced = content.replace(/\{\{REPO_NAME\}\}/g, "test-team");
    expect(replaced).toContain("# test-team");
    expect(replaced).not.toContain("{{REPO_NAME}}");
  });

  test("distill workflow uses github-copilot provider by default", () => {
    const yml = readFileSync(
      join(TEMPLATES_DIR, "github-action", "distill-knowledge.yml"),
      "utf-8",
    );
    expect(yml).toContain("GITHUB_TOKEN");
    expect(yml).toContain("github-copilot");
    expect(yml).not.toContain("ANTHROPIC_API_KEY");
  });
});
