# Claude Code Integration for Primate

This directory contains Claude Code integration files that help Claude Code understand and work with Primate framework projects.

## Contents

```
claude-code/
├── README.md                    # This file
├── CLAUDE.md                    # Main guidance document (copy to your project)
├── skills/
│   └── primate/
│       ├── SKILL.md             # /primate skill definition
│       └── references/
│           ├── entity-templates.md
│           ├── api-patterns.md
│           └── prisma-snippets.md
└── examples/
    ├── products/
    │   ├── products.js          # Example entity router
    │   ├── product.service.js   # Example custom service
    │   └── product.schema.js    # Example JOI validation
    └── prisma-model-example.md  # Example Prisma model
```

## Quick Setup

### Option 1: CLAUDE.md Only (Recommended for Most Users)

Copy the `CLAUDE.md` file to your Primate project root:

```bash
# From your Primate project directory
cp path/to/primate/claude-code/CLAUDE.md ./CLAUDE.md
```

This gives Claude Code comprehensive knowledge about:
- Project structure and naming conventions
- Entity, service, and schema patterns
- API endpoints and query parameters
- Authentication patterns
- Debugging common issues

### Option 2: Full Integration (CLAUDE.md + Skill)

For the full experience including the `/primate` slash command:

```bash
# From your Primate project directory

# 1. Copy CLAUDE.md
cp path/to/primate/claude-code/CLAUDE.md ./CLAUDE.md

# 2. Create .claude directory structure
mkdir -p .claude/skills/primate/references

# 3. Copy skill files
cp path/to/primate/claude-code/skills/primate/SKILL.md .claude/skills/primate/
cp path/to/primate/claude-code/skills/primate/references/* .claude/skills/primate/references/
```

## Using the Integration

### With CLAUDE.md

Once `CLAUDE.md` is in your project root, Claude Code will automatically read it when working on your project. You can ask Claude to:

- "Create a new Product entity with name, price, and description"
- "Add a custom service for users that hashes passwords"
- "Add JOI validation for the product entity"
- "Help me debug why my entity isn't loading"

### With the /primate Skill

If you installed the skill, you can use these commands:

```
/primate entity Product
/primate service user
/primate schema product
```

## What's Included

### CLAUDE.md

The main guidance document covers:

- **Project Structure** - Where files go and naming conventions
- **Entity Router Pattern** - How to create entity files with `Primate.setupRoute()`
- **Prisma Model Pattern** - Standard fields and relation patterns
- **Custom Service Pattern** - Hooks for business logic (beforeCreate, afterCreate, etc.)
- **Schema Validation** - JOI validation patterns
- **API Endpoints** - Auto-generated CRUDAG routes
- **Query Parameters** - Pagination, search, filtering, relations (`with` parameter)
- **Authentication** - JWT and master token patterns
- **Response Format** - Standard response structure
- **Debugging Guide** - Comprehensive troubleshooting for common issues

### Skill (/primate)

The skill provides commands to scaffold code:

| Command | Description |
|---------|-------------|
| `/primate entity <Name>` | Generate entity router + Prisma model |
| `/primate service <name>` | Generate custom service with hooks |
| `/primate schema <name>` | Generate JOI validation schema |

### Examples

Working code examples you can reference or copy:

- **products/products.js** - Complete entity router with custom endpoints
- **products/product.service.js** - Custom service with hooks and slug generation
- **products/product.schema.js** - Comprehensive JOI validation
- **prisma-model-example.md** - Example Prisma model with all field types

## Customization

### Extending CLAUDE.md

You can add project-specific sections to CLAUDE.md:

```markdown
## Project-Specific Patterns

### Our Custom Auth Flow
We use a custom auth middleware that checks...

### Database Naming
We prefix all tables with `app_`...
```

### Adding Custom Skills

Create additional skill files in `.claude/skills/` for project-specific commands:

```
.claude/skills/
├── primate/           # General Primate skill
└── my-project/        # Project-specific skills
    └── SKILL.md
```

## Updating

When Primate is updated, you may want to update your Claude Code integration:

```bash
# Re-copy CLAUDE.md for latest patterns
cp path/to/primate/claude-code/CLAUDE.md ./CLAUDE.md

# Re-copy skill files if using full integration
cp path/to/primate/claude-code/skills/primate/SKILL.md .claude/skills/primate/
cp path/to/primate/claude-code/skills/primate/references/* .claude/skills/primate/references/
```

## Troubleshooting

### Claude doesn't see CLAUDE.md

- Ensure CLAUDE.md is in your project root (same level as package.json)
- File must be named exactly `CLAUDE.md` (case-sensitive)
- Restart Claude Code session after adding the file

### Skill commands not working

- Ensure `.claude/skills/primate/SKILL.md` exists
- Check file permissions
- Restart Claude Code session

### Outdated patterns

- Re-copy files from the latest Primate version
- Check Primate changelog for breaking changes

## Support

- **Primate Issues**: https://github.com/thewebchimp/primate/issues
- **Claude Code Issues**: https://github.com/anthropics/claude-code/issues
