#!/usr/bin/env bun
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function titleCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const SKILL_TEMPLATE = (name: string, title: string) => `---
name: ${name}
description: "TODO: Complete and informative explanation of what the skill does and when to use it. Include WHEN to use this skill - specific scenarios, file types, or tasks that trigger it."
---

# ${title}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" → "Reading" → "Creating" → "Editing"
- Structure: ## Overview → ## Workflow Decision Tree → ## Step 1 → ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" → "Merge PDFs" → "Split PDFs" → "Extract Text"
- Structure: ## Overview → ## Quick Start → ## Task Category 1 → ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" → "Colors" → "Typography" → "Features"
- Structure: ## Overview → ## Guidelines → ## Specifications → ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" → numbered capability list
- Structure: ## Overview → ## Core Capabilities → ### 1. Feature → ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources

This skill includes example resource directories that demonstrate how to organize different types of bundled resources:

### scripts/
Executable code that can be run directly to perform specific operations.

### references/
Documentation and reference material intended to be loaded into context to inform Claude's process and thinking.

### assets/
Files not intended to be loaded into context, but rather used within the output Claude produces.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
`;

const EXAMPLE_SCRIPT = (name: string) => `#!/usr/bin/env bun
/**
 * Example helper script for ${name}
 *
 * This is a placeholder script that can be executed directly.
 * Replace with actual implementation or delete if not needed.
 */

function main() {
  console.log("This is an example script for ${name}");
  // TODO: Add actual script logic here
}

main();
`;

const EXAMPLE_REFERENCE = (
  title: string,
) => `# Reference Documentation for ${title}

This is a placeholder for detailed reference documentation.
Replace with actual reference content or delete if not needed.

## When Reference Docs Are Useful

Reference docs are ideal for:
- Comprehensive API documentation
- Detailed workflow guides
- Complex multi-step processes
- Information too lengthy for main SKILL.md
- Content that's only needed for specific use cases
`;

const EXAMPLE_ASSET = `# Example Asset File

This placeholder represents where asset files would be stored.
Replace with actual asset files (templates, images, fonts, etc.) or delete if not needed.

Asset files are NOT intended to be loaded into context, but rather used within
the output Claude produces.
`;

export interface InitResult {
  message: string;
  path: string | null;
  success: boolean;
}

export function initSkill(skillName: string, basePath: string): InitResult {
  const skillDir = resolve(basePath, skillName);

  if (existsSync(skillDir)) {
    return {
      message: `Skill directory already exists: ${skillDir}`,
      path: null,
      success: false,
    };
  }

  try {
    mkdirSync(skillDir, { recursive: true });
  } catch (e) {
    return {
      message: `Error creating directory: ${e}`,
      path: null,
      success: false,
    };
  }

  const title = titleCase(skillName);

  // SKILL.md
  writeFileSync(
    resolve(skillDir, "SKILL.md"),
    SKILL_TEMPLATE(skillName, title),
  );

  // scripts/
  const scriptsDir = resolve(skillDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const exampleScript = resolve(scriptsDir, "example.ts");
  writeFileSync(exampleScript, EXAMPLE_SCRIPT(skillName));
  chmodSync(exampleScript, 0o755);

  // references/
  const refsDir = resolve(skillDir, "references");
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(resolve(refsDir, "api_reference.md"), EXAMPLE_REFERENCE(title));

  // assets/
  const assetsDir = resolve(skillDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(resolve(assetsDir, "example_asset.txt"), EXAMPLE_ASSET);

  return {
    message: `Skill '${skillName}' initialized at ${skillDir}`,
    path: skillDir,
    success: true,
  };
}

// CLI entry point
if (import.meta.main) {
  if (process.argv.length < 5 || process.argv[3] !== "--path") {
    console.log("Usage: bun init-skill.ts <skill-name> --path <path>");
    process.exit(1);
  }

  const skillName = process.argv[2];
  const basePath = process.argv[4];

  console.log(`Initializing skill: ${skillName}`);
  console.log(`Location: ${basePath}\n`);

  const result = initSkill(skillName, basePath);
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}
