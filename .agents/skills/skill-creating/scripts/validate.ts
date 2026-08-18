#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ValidationResult {
  message: string;
  valid: boolean;
}

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

function extractFrontmatter(content: string): ValidationResult | string {
  if (!content.startsWith("---")) {
    return { message: "No YAML frontmatter found", valid: false };
  }
  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) {
    return { message: "Invalid frontmatter format", valid: false };
  }
  return match[1];
}

function parseFrontmatter(
  raw: string,
): ValidationResult | Record<string, unknown> {
  try {
    const parsed = Bun.YAML.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { message: "Frontmatter must be a YAML dictionary", valid: false };
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    return {
      message: `Invalid YAML in frontmatter: ${e}`,
      valid: false,
    };
  }
}

function validateProperties(
  fm: Record<string, unknown>,
): ValidationResult | null {
  const unexpected = Object.keys(fm).filter((k) => !ALLOWED_PROPERTIES.has(k));
  if (unexpected.length > 0) {
    return {
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpected.sort().join(", ")}. Allowed properties are: ${[...ALLOWED_PROPERTIES].sort().join(", ")}`,
      valid: false,
    };
  }
  return null;
}

function validateName(fm: Record<string, unknown>): ValidationResult | null {
  if (!("name" in fm)) {
    return { message: "Missing 'name' in frontmatter", valid: false };
  }
  const name = fm.name;
  if (typeof name !== "string") {
    return {
      message: `Name must be a string, got ${typeof name}`,
      valid: false,
    };
  }
  const trimmed = name.trim();
  if (trimmed) {
    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      return {
        message: `Name '${trimmed}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
        valid: false,
      };
    }
    if (
      trimmed.startsWith("-") ||
      trimmed.endsWith("-") ||
      trimmed.includes("--")
    ) {
      return {
        message: `Name '${trimmed}' cannot start/end with hyphen or contain consecutive hyphens`,
        valid: false,
      };
    }
    if (trimmed.length > 64) {
      return {
        message: `Name is too long (${trimmed.length} characters). Maximum is 64 characters.`,
        valid: false,
      };
    }
  }
  return null;
}

function validateDescription(
  fm: Record<string, unknown>,
): ValidationResult | null {
  if (!("description" in fm)) {
    return { message: "Missing 'description' in frontmatter", valid: false };
  }
  const desc = fm.description;
  if (typeof desc !== "string") {
    return {
      message: `Description must be a string, got ${typeof desc}`,
      valid: false,
    };
  }
  const trimmed = desc.trim();
  if (trimmed) {
    if (trimmed.includes("<") || trimmed.includes(">")) {
      return {
        message: "Description cannot contain angle brackets (< or >)",
        valid: false,
      };
    }
    if (trimmed.length > 1024) {
      return {
        message: `Description is too long (${trimmed.length} characters). Maximum is 1024 characters.`,
        valid: false,
      };
    }
  }
  return null;
}

function validateCompatibility(
  fm: Record<string, unknown>,
): ValidationResult | null {
  const compat = fm.compatibility;
  if (compat == null) return null;
  if (typeof compat !== "string") {
    return {
      message: `Compatibility must be a string, got ${typeof compat}`,
      valid: false,
    };
  }
  if (compat.length > 500) {
    return {
      message: `Compatibility is too long (${compat.length} characters). Maximum is 500 characters.`,
      valid: false,
    };
  }
  return null;
}

export function validateSkill(skillPath: string): ValidationResult {
  const skillMdPath = resolve(skillPath, "SKILL.md");

  let content: string;
  try {
    content = readFileSync(skillMdPath, "utf-8");
  } catch {
    return { message: "SKILL.md not found", valid: false };
  }

  const rawOrError = extractFrontmatter(content);
  if (typeof rawOrError !== "string") return rawOrError;

  const fmOrError = parseFrontmatter(rawOrError);
  if ("valid" in fmOrError) return fmOrError as ValidationResult;

  const fm = fmOrError as Record<string, unknown>;

  for (const check of [
    validateProperties,
    validateName,
    validateDescription,
    validateCompatibility,
  ]) {
    const result = check(fm);
    if (result) return result;
  }

  return { message: "Skill is valid!", valid: true };
}

// CLI entry point
if (import.meta.main) {
  if (process.argv.length !== 3) {
    console.log("Usage: bun validate.ts <skill_directory>");
    process.exit(1);
  }
  const { valid, message } = validateSkill(process.argv[2]);
  console.log(message);
  process.exit(valid ? 0 : 1);
}
