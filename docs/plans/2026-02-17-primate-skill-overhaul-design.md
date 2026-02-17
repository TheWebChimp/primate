# Primate Skill Overhaul Design

**Date:** 2026-02-17
**Author:** Claude Code
**Status:** Approved

## Goal

Replace and improve the existing `/primate` Claude Code skill with a comprehensive, source-aware skill that covers the full development lifecycle: project init, entity scaffolding, relations, auth, debugging, testing, and migrations.

## Context

The current `/primate` skill has three commands (`entity`, `service`, `schema`) with templates that are stale relative to the latest framework features (e.g., `with` parameter, config merge changes). The skill lacks deep context about the framework, provides no debugging support, and doesn't help with common tasks like relations, auth, or migrations.

**Target audience:** Solo developer (framework author) who needs fast, accurate scaffolding and troubleshooting.

## Approach

**Unified Comprehensive Skill** — A single `/primate` skill with 10 commands and 6 reference files, living in the Primate repo at `claude-code/skills/primate/`.

### Why this approach

- One skill to remember, one place to maintain
- Reference files keep the main SKILL.md focused
- Stays in sync with framework changes
- Prescriptive step-by-step behavior, not just templates

## Commands

| # | Command | Purpose |
|---|---------|---------|
| 1 | `/primate init` | Bootstrap a new Primate project (index.js, .env, prisma/schema.prisma, entities/ dir) |
| 2 | `/primate entity <Name>` | Scaffold entity with router + Prisma model. Interactive field builder, relation detection, optional service/schema |
| 3 | `/primate service <name>` | Generate service with hooks. Hook picker: slug, password hash, computed fields, soft delete |
| 4 | `/primate schema <name>` | Generate JOI validation. Reads Prisma model to auto-generate matching validations |
| 5 | `/primate relation <Parent> <Child>` | Set up relation between entities. Creates FK, updates both Prisma models, suggests `with` patterns |
| 6 | `/primate endpoint <entity>` | Add custom endpoint to entity. Menu: public/protected/master-only, HTTP method |
| 7 | `/primate auth <entity>` | Set up auth endpoints. Login/register routes, JWT signing, password hashing |
| 8 | `/primate migrate` | Guide Prisma migration. Detects schema changes, runs generate/push/migrate |
| 9 | `/primate debug` | Interactive troubleshooting. Scans project for common issues, suggests fixes |
| 10 | `/primate test <entity>` | Generate test scripts. Curl commands or test file for CRUDAG + custom endpoints |

## File Structure

```
claude-code/skills/primate/
├── SKILL.md                          # Main skill definition
└── references/
    ├── entity-templates.md           # Updated router/service/schema templates
    ├── api-patterns.md               # Updated query, with, response patterns
    ├── prisma-snippets.md            # Updated model, relation, index patterns
    ├── debugging-guide.md            # NEW: Common issues, diagnostics, fixes
    ├── auth-patterns.md              # NEW: JWT flow, login/register, permissions
    └── project-init-template.md      # NEW: Boilerplate for /primate init
```

## SKILL.md Structure

1. **Frontmatter** — name, description
2. **Framework Context** — Primate overview, key exports, architecture
3. **Naming Convention Rules** — Critical conversion table (PascalCase -> plural folder -> camelCase setupRoute, etc.)
4. **Commands** — Each with:
   - Usage syntax and examples
   - Step-by-step behavior instructions for Claude
   - Files created/modified
   - Post-generation reminders
5. **Error Handling** — What to check when things go wrong
6. **References** — Pointers to reference files

## Key Design Decisions

### Prescriptive over descriptive
The SKILL.md tells Claude exactly what to do step by step, not just what templates look like. Example: "1. Read the Prisma schema. 2. Find the model. 3. Extract field names and types. 4. Generate JOI validations matching each field."

### Source-aware templates
Templates will match the actual framework source code (v1.2.5), including:
- `with` parameter syntax for nested relations with field selection
- `disableMetasAuth` option in setupRoute
- `res.respond()` for standardized responses
- Correct import paths (`@thewebchimp/primate`)
- Hook signatures (`data, options = {}`)

### Smart defaults
- Entity command asks for fields interactively, suggests `metas`, `uid`, timestamps
- Schema command reads the Prisma model first, doesn't ask for field types twice
- Debug command reads actual project files, doesn't just list generic advice
- Relation command checks if models exist before creating FK

### Reference file updates

**entity-templates.md changes:**
- Add `with` parameter examples in custom endpoints
- Add `disableMetasAuth` to auth options
- Add hook selection templates (slug, computed, soft delete)
- Update service template to include all 10 hooks

**api-patterns.md changes:**
- Add nested `with` syntax: `with=author.profile(bio)`
- Add `count=true` and `select` parameter docs
- Add range filter syntax: `price=10..50`
- Update response format with `requestId`

**prisma-snippets.md changes:**
- Add soft delete pattern with service integration
- Add explicit junction table pattern
- Add self-referential tree pattern
- Add MySQL-specific annotations section

**NEW debugging-guide.md:**
- Entity not loading (folder naming, export format)
- Model not found (case mismatch, missing generate)
- Prisma errors (P2002, P2003, P2025 with solutions)
- Auth errors (token format, expiration, secret mismatch)
- Relation errors with `with` parameter
- Validation errors (schema export, field types)
- Step-by-step diagnostic commands to run

**NEW auth-patterns.md:**
- JWT signing and verification flow
- Login endpoint template
- Register endpoint template
- Password hashing with bcrypt
- Permission middleware usage
- Master token patterns
- Custom auth middleware

**NEW project-init-template.md:**
- index.js boilerplate
- .env template with all variables
- package.json with scripts and dependencies
- prisma/schema.prisma with datasource config
- entities/ directory with .gitkeep

## Testing Approach

After implementation, verify each command works by:
1. Running `/primate init` in a temp directory
2. Using `/primate entity Product` to scaffold
3. Using `/primate service product` with slug hook
4. Using `/primate schema product` and checking it matches the Prisma model
5. Using `/primate relation User Product` to add a foreign key
6. Using `/primate debug` to scan for issues
7. Using `/primate test product` to generate curl commands

## Out of Scope

- Changes to the Primate framework source code itself
- Changes to the CLAUDE.md (it's separate from the skill)
- Automated testing infrastructure (the `/primate test` command generates scripts, not a test runner)
- Multi-database support beyond MySQL (Primate currently targets MySQL)
