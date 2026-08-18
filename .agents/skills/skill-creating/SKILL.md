---
name: skill-creating
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

Act as an expert skill designer to create effective, well-structured
skills that extend Claude's capabilities with specialized knowledge
and workflows.

constraint SpecAwareness {
  If the official skill specification at https://agentskills.io/specification
  and the Claude Code skills docs at https://code.claude.com/docs/en/skills
  have not already been read this session, read them before proceeding.
}

Skill {
  A modular, self-contained package that extends Claude's capabilities with
  specialized knowledge, workflows, and tools. Think of it as an "onboarding
  guide" that transforms Claude from a general-purpose agent into a specialized
  one equipped with procedural knowledge no model fully possesses.

  Provides {
    - Specialized workflows — multi-step procedures for specific domains
    - Tool integrations — instructions for specific file formats or APIs
    - Domain expertise — company-specific knowledge, schemas, business logic
    - Bundled resources — scripts, references, and assets for complex tasks
  }

  Anatomy {
    ```
    skill-name/
    ├── SKILL.md (required)
    │   ├── YAML frontmatter (required): name, description, compatibility?
    │   └── Body instructions (required)
    └── Bundled Resources (optional)
        ├── scripts/     — Executable code (TypeScript/Bash/etc.)
        ├── references/  — Documentation loaded into context as needed
        └── assets/      — Files used in output (templates, icons, fonts)
    ```
  }

  Constraints {
    Context window is a public good — only add what Claude doesn't already know.
    Challenge each piece: "Does this justify its token cost?"
    Prefer concise examples over verbose explanations.
    Keep SKILL.md body under 500 lines.
    Avoid deeply nested references — keep them one level from SKILL.md.
    Do NOT create extraneous files (README.md, CHANGELOG.md, etc.).
    Only include information needed for an AI agent to do the job.
    Write SKILL.md body and reference files in SudoLang — use interfaces,
    constraints, pattern matching, and /commands instead of plain prose.
    Consult [references/sudolang.sudo.md](references/sudolang.sudo.md) for syntax.
  }
}

Frontmatter {
  name: string     — kebab-case, max 64 chars (required)
  description: string — what the skill does AND when to use it, max 1024 chars (required)
  compatibility: string? — environment requirements, max 500 chars

  NamingConvention {
    Skills: [domain]-[activity] using a gerund or deverbal noun.
    In this repo, skills follow the aidd structure but keep LOCAL names —
    no `aidd-` prefix. Examples: rough-cut, podcast-clips, skill-creating,
    prose-writing.
    Skills describe what you know how to do; subagents describe who does it.
  }

  Constraints {
    name must follow the NamingConvention.
    description is the primary triggering mechanism — include all "when to use" info here.
    Do not include "When to Use" sections in the body; the body loads after triggering.
    Only spec-defined fields: name, description, compatibility, allowed-tools,
    license. Do not invent custom frontmatter fields.
  }
}

FreedomLevel {
  Match specificity to the task's fragility and variability.

  apply(task) => match (task) {
    case (fragile, error-prone, consistency-critical) =>
      Low freedom: specific scripts, few parameters, guardrails
    case (preferred pattern exists, some variation acceptable) =>
      Medium freedom: pseudocode or parameterized scripts
    case (multiple approaches valid, context-dependent) =>
      High freedom: text-based instructions, heuristics
  }
}

ProgressiveDisclosure {
  Level 1: Metadata (name + description) — always in context (~100 words)
  Level 2: SKILL.md body — loaded when skill triggers (<5k words)
  Level 3: Bundled resources — loaded as needed (unlimited)

  Constraints {
    Split content into separate files when SKILL.md approaches 500 lines.
    Reference all split files from SKILL.md with clear "when to read" guidance.
    Structure reference files >100 lines with a table of contents.
  }
}

## Design Patterns

Consult these references based on the skill's needs:

- **Multi-step processes**: See [references/workflows.sudo.md](references/workflows.sudo.md)
- **Output formats or quality standards**: See [references/output-patterns.sudo.md](references/output-patterns.sudo.md)
- **SudoLang syntax reference**: See [references/sudolang.sudo.md](references/sudolang.sudo.md)

## Creation Process

/understand - Gather concrete usage examples {
  Ask how the skill will be used; collect examples or generate and validate them.
  Questions: What functionality? Example requests? What triggers the skill?
  Avoid overwhelming — start with the most important questions.
  Conclude when the skill's scope is clear.
}

/plan - Analyze examples into reusable contents {
  For each example, consider: how to execute from scratch, what scripts/references/assets
  would help when doing this repeatedly.
  Produce a list of reusable resources: scripts, references, assets.
}

/init [name] --path [dir] - Scaffold the skill {
  Run: `bun scripts/init-skill.ts <name> --path <dir>`
  Skip if the skill already exists and only needs iteration.
  Creates SKILL.md template, scripts/, references/, assets/ with example files.
}

/edit - Implement resources and write SKILL.md {
  Start with scripts, references, and assets identified in /plan.
  Test added scripts by running them.
  Delete unneeded example files from scaffolding.
  Write SKILL.md frontmatter (name + description) and body instructions.
}

/package [path] - Validate and package for distribution {
  Run: `bun scripts/package-skill.ts <path/to/skill-folder> [output-dir]`
  Validates automatically, then creates a .skill ZIP archive.
  Fix any validation errors and re-run if needed.
}

/iterate - Improve based on real usage {
  1. Use the skill on real tasks
  2. Notice struggles or inefficiencies
  3. Update SKILL.md or bundled resources
  4. Test again
}
