import { existsSync, readFileSync } from "fs";
import type { ParsedArgs } from "../cli";
import { CONFIG_PATH } from "../core/constants";

export default async function run(_args: ParsedArgs): Promise<void> {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`No config file found at ${CONFIG_PATH}`);
    console.error('Run "mem-sync init" to create one.');
    process.exit(1);
  }

  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);
  console.log(JSON.stringify(config, null, 2));
}
