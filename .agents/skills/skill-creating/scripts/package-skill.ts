#!/usr/bin/env bun
import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { $ } from "bun";

import { validateSkill } from "./validate.ts";

const EXCLUDE_PATTERNS = [
  "node_modules/*",
  "package.json",
  "tsconfig.json",
  "bun.lockb",
  "bun.lock",
];

export interface PackageResult {
  message: string;
  outputPath: string | null;
  success: boolean;
}

export async function packageSkill(
  skillPath: string,
  outputDir?: string,
): Promise<PackageResult> {
  const resolved = resolve(skillPath);

  if (!existsSync(resolved)) {
    return {
      message: `Skill folder not found: ${resolved}`,
      outputPath: null,
      success: false,
    };
  }

  if (!statSync(resolved).isDirectory()) {
    return {
      message: `Path is not a directory: ${resolved}`,
      outputPath: null,
      success: false,
    };
  }

  // Validate first
  const validation = validateSkill(resolved);
  if (!validation.valid) {
    return {
      message: `Validation failed: ${validation.message}`,
      outputPath: null,
      success: false,
    };
  }

  const skillName = basename(resolved);
  const outDir = outputDir ? resolve(outputDir) : process.cwd();
  const outputPath = resolve(outDir, `${skillName}.skill`);

  const excludeArgs = EXCLUDE_PATTERNS.flatMap((p) => [
    "-x",
    `${skillName}/${p}`,
  ]);

  const result = await $`zip -r -9 ${outputPath} ${skillName} ${excludeArgs}`
    .cwd(dirname(resolved))
    .quiet()
    .nothrow();

  if (result.exitCode !== 0) {
    return {
      message: `Error creating .skill file: ${result.stderr.toString().trim()}`,
      outputPath: null,
      success: false,
    };
  }

  return {
    message: `Successfully packaged skill to: ${outputPath}`,
    outputPath,
    success: true,
  };
}

// CLI entry point
if (import.meta.main) {
  if (process.argv.length < 3) {
    console.log(
      "Usage: bun package-skill.ts <path/to/skill-folder> [output-directory]",
    );
    process.exit(1);
  }

  const skillPath = process.argv[2];
  const outputDir = process.argv[3];

  console.log(`Packaging skill: ${skillPath}\n`);

  const result = await packageSkill(skillPath, outputDir);
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}
