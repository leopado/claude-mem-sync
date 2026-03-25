# {{REPO_NAME}}

> Shared AI memory repository — powered by [claude-mem-sync](https://github.com/lopadova/claude-mem-sync)

## What is this?

This repository stores shared AI coding memories from your team. When developers use
[claude-mem](https://docs.claude-mem.ai) with Claude Code, their observations (decisions,
bug fixes, discoveries) are exported here, merged, and optionally distilled into
team-wide rules and knowledge docs.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `contributions/` | Raw exports from each developer (auto-cleaned after merge) |
| `merged/` | Deduplicated, capped merged observations per project |
| `profiles/` | Developer knowledge profiles (auto-generated) |
| `distilled/` | LLM-distilled rules and knowledge base (if enabled) |

## How to Join

1. Install the Claude Code plugin: `claude /install-plugin lopadova/claude-mem-sync`
2. Run the setup wizard: `mem-sync init`
3. Use this repo as your remote
4. Export your first memories: `mem-sync export --project <name>`

## Learn More

- [claude-mem-sync documentation](https://github.com/lopadova/claude-mem-sync#readme)
- [claude-mem documentation](https://docs.claude-mem.ai)
