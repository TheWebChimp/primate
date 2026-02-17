# Primate Skill Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing `/primate` Claude Code skill with a comprehensive 10-command skill covering init, entities, services, schemas, relations, endpoints, auth, migrations, debugging, and testing.

**Architecture:** Single SKILL.md with 10 prescriptive commands, backed by 6 reference files (3 updated, 3 new). Each command includes step-by-step behavior instructions that tell Claude exactly what to do, not just templates. Reference files provide detailed code templates and patterns.

**Tech Stack:** Claude Code skills (Markdown), Primate framework v1.2.5 (Express.js + Prisma)

---

### Task 1: Write the new SKILL.md

The main skill definition file. This is the core deliverable — it defines all 10 commands with prescriptive step-by-step behavior.

**Files:**
- Replace: `claude-code/skills/primate/SKILL.md`

**Step 1: Write the SKILL.md**

Write the complete SKILL.md with the following structure. Key sections and their content:

**Frontmatter:**
```yaml
---
name: primate
description: Comprehensive Primate framework skill — scaffolding, debugging, auth, migrations, and testing. Use for any task involving the Primate framework (@thewebchimp/primate).
---
```

**Framework Context section** must include:
- Primate is a Node.js REST API framework built on Express.js and Prisma
- Auto-generates CRUDAG endpoints from Prisma models
- Key exports from `@thewebchimp/primate`: `Primate`, `PrimateService`, `PrimateController`, `auth`, `jwt`
- Named auth exports available from `@thewebchimp/primate/src/middlewares/auth.js`: `masterOnly`, `isMasterToken`, `hasPermission`
- Entity auto-discovery from `entities/` directory
- `res.respond()` for standardized JSON responses

**Naming Convention Rules** — THE critical table:

| Input | Prisma Model | Folder | Router File | Service File | Schema File | setupRoute | DB Table (@@map) |
|-------|-------------|--------|-------------|--------------|-------------|------------|-----------------|
| `Product` | `Product` | `products/` | `products.js` | `product.service.js` | `product.schema.js` | `'product'` | `product` |
| `BlogPost` | `BlogPost` | `blog-posts/` | `blog-posts.js` | `blog-post.service.js` | `blog-post.schema.js` | `'blogPost'` | `blog_post` |
| `OrderItem` | `OrderItem` | `order-items/` | `order-items.js` | `order-item.service.js` | `order-item.schema.js` | `'orderItem'` | `order_item` |

Conversion rules:
- PascalCase → kebab-case: Insert hyphen before each uppercase letter, lowercase all
- Plural: Use `pluralize` rules (e.g., `Category` → `categories`, `Person` → `people`)
- setupRoute: camelCase (first letter lowercase of PascalCase)
- DB table: snake_case (replace hyphens with underscores from kebab-case singular)

**Commands** — Each command must have:
1. Usage syntax with example
2. Numbered step-by-step behavior instructions
3. Files created/modified
4. Post-action reminders

Here is the exact specification for each command:

---

**Command: `/primate init`**
- Usage: `/primate init`
- Steps:
  1. Check if project already has package.json — if so, warn and ask to confirm
  2. Create directory structure: `entities/`, `routes/`, `prisma/`
  3. Write `index.js` — use template from `references/project-init-template.md`
  4. Write `.env` — use template from `references/project-init-template.md`
  5. Write `prisma/schema.prisma` — use template from `references/project-init-template.md`
  6. If no package.json exists, create one with Primate dependencies
  7. Run `yarn install` (or `npm install`)
  8. Run `npx prisma generate`
  9. Remind user: set DATABASE_URL and ACCESS_TOKEN_SECRET in .env, then `npx prisma db push`

---

**Command: `/primate entity <Name>`**
- Usage: `/primate entity Product`, `/primate entity BlogPost`
- Steps:
  1. Apply naming conventions: derive folder, files, model name, table name
  2. Ask user for fields: name, type (String/Int/Float/Boolean/DateTime/Json), required?, unique?, default?
  3. Suggest standard fields: `uid`, `metas`, `created`, `modified` (auto-included unless declined)
  4. Detect potential relations: If user mentions fields like `idUser` or `userId`, ask about the relation
  5. Create entity folder: `entities/{plural}/`
  6. Write router file: `entities/{plural}/{plural}.js` using template from `references/entity-templates.md`
     - Include `queryableFields` from String fields
     - Include `searchField` if entity has slug/username/email
  7. Append Prisma model to `prisma/schema.prisma` using template from `references/prisma-snippets.md`
     - Include `@@map("{table_name}")` with snake_case
     - Include `@@index` for foreign keys and status fields
  8. Ask: "Want a custom service?" → if yes, run `/primate service` logic
  9. Ask: "Want JOI validation?" → if yes, run `/primate schema` logic
  10. Remind: `npx prisma generate && npx prisma db push`, restart server

---

**Command: `/primate service <name>`**
- Usage: `/primate service product`, `/primate service blog-post`
- Steps:
  1. Apply naming conventions from input (e.g., `product` → `ProductService`, file: `product.service.js`, folder: `products/`)
  2. Check entity folder exists — warn if not
  3. Ask which hook patterns to include (multiple choice):
     - Slug generation (beforeCreate/beforeUpdate) — auto-generates from a name/title field
     - Password hashing (beforeCreate/beforeUpdate) — bcrypt hash
     - Sensitive field removal (afterCreate/afterGet/afterAll) — strip fields from responses
     - Computed fields (afterGet/afterAll) — add calculated properties
     - Soft delete (beforeDelete) — set isDeleted flag instead of deleting
     - Dependency check (beforeDelete) — prevent deletion if related records exist
     - Basic hooks (empty beforeCreate/afterCreate/afterGet/afterAll)
  4. Read the Prisma model to identify fields and use them in hook implementations
  5. Write service file: `entities/{plural}/{singular}.service.js` using selected templates from `references/entity-templates.md`
  6. All hooks use signature: `static async hookName(data, options = {})` (or `record` for after hooks, `records` for afterAll)
  7. Class name: `{ModelName}Service`, exported as default

---

**Command: `/primate schema <name>`**
- Usage: `/primate schema product`
- Steps:
  1. Apply naming conventions
  2. Read `prisma/schema.prisma` — find the model
  3. Extract fields, types, and constraints from Prisma model
  4. Map each field to JOI validation:
     - `String` → `Joi.string()`, add `.max(255)` for regular, `.max(2000)` for `@db.Text`
     - `String @unique` → add `.required()` for create
     - `Int` → `Joi.number().integer()`
     - `Float` → `Joi.number()`
     - `Boolean` → `Joi.boolean()`
     - `DateTime` → `Joi.date().iso()`
     - `Json` → `Joi.object()` or `Joi.array()` depending on default
     - `String @default("value")` → add `.default("value")`
     - Optional fields (marked with `?`) → no `.required()`
  5. Skip auto-managed fields: `id`, `uid`, `created`, `modified`, `metas`
  6. Skip relation fields (fields that reference other models)
  7. Write schema file: `entities/{plural}/{singular}.schema.js`
  8. Schema variable name: `{modelName}Schema` (camelCase + Schema)
  9. Export as default

---

**Command: `/primate relation <Parent> <Child>`**
- Usage: `/primate relation User Post`, `/primate relation Category Product`
- Steps:
  1. Validate both models exist in `prisma/schema.prisma`
  2. Determine relation type — ask user:
     - One-to-many: Parent has many Children (most common)
     - One-to-one: Parent has one Child
     - Many-to-many: Both have many of each other
  3. For one-to-many:
     - Add `id{Parent} Int` foreign key to Child model
     - Add `{parent} {Parent} @relation(fields: [id{Parent}], references: [id])` to Child
     - Add `{children} {Child}[]` to Parent model
     - Add `@@index([id{Parent}])` to Child
  4. For one-to-one:
     - Add `id{Parent} Int @unique` to Child model
     - Add relation fields to both
  5. For many-to-many:
     - Ask: implicit (Prisma auto-creates junction table) or explicit?
     - If implicit: add `{children} {Child}[]` to Parent, `{parents} {Parent}[]` to Child
     - If explicit: create junction model with composite key
  6. FK naming convention: `id{Parent}` (e.g., `idUser`, `idCategory`) — matches framework's ORM relation detection in `primate.js:addOneToManyRelations`
  7. Remind: `npx prisma generate && npx prisma db push`
  8. Show `with` parameter examples: `GET /{children}?with={parent}`, `GET /{parents}?with={children}`

---

**Command: `/primate endpoint <entity>`**
- Usage: `/primate endpoint product`
- Steps:
  1. Apply naming conventions
  2. Read existing router file: `entities/{plural}/{plural}.js`
  3. Ask endpoint details:
     - HTTP method: GET, POST, PUT, DELETE
     - Path (relative to entity root): e.g., `/featured`, `/slug/:slug`, `/bulk/status`
     - Auth level: public (no auth), protected (`auth` middleware), master-only (`masterOnly` middleware)
  4. Generate endpoint code using patterns from `references/api-patterns.md`:
     - Use `PrimateService` methods for data operations
     - Use `res.respond()` for responses
     - Wrap in try-catch
  5. Insert the new route AFTER the `Primate.setupRoute()` call in the router file
  6. Add necessary imports (`auth`, `masterOnly`, `PrimateService`) if not already present

---

**Command: `/primate auth <entity>`**
- Usage: `/primate auth user`
- Steps:
  1. Apply naming conventions — typically `user` entity
  2. Check entity exists, check if service file exists
  3. Create or update service with password hashing hooks (beforeCreate, beforeUpdate)
  4. Create auth routes file: `routes/auth.js` using template from `references/auth-patterns.md`:
     - `POST /auth/login` — email + password → JWT token
     - `POST /auth/register` — create user with hashed password → JWT token
     - `GET /auth/me` — return current user from token
     - `POST /auth/refresh` — refresh token (optional)
  5. Add imports: `jwt` from `@thewebchimp/primate`, `bcrypt`
  6. Ensure `routes/` directory exists
  7. Remind: load routes in `index.js` with `await primate.routes('./routes')`, ensure it's called BEFORE `primate.start()`
  8. Remind: user model needs `email String @unique` and `password String` fields

---

**Command: `/primate migrate`**
- Usage: `/primate migrate`
- Steps:
  1. Read `prisma/schema.prisma` to understand current state
  2. Ask migration type:
     - **Dev push** (quick, no migration history): `npx prisma db push`
     - **Migration** (tracked, production-safe): `npx prisma migrate dev --name <description>`
     - **Generate only** (update client without DB changes): `npx prisma generate`
     - **Reset** (destructive, development only): `npx prisma migrate reset`
  3. For dev push: run `npx prisma generate && npx prisma db push`
  4. For migration: ask for migration name, run `npx prisma migrate dev --name <name>`
  5. For generate: run `npx prisma generate`
  6. For reset: WARN this is destructive, confirm, then run `npx prisma migrate reset`
  7. After any migration: remind to restart the server

---

**Command: `/primate debug`**
- Usage: `/primate debug`
- Steps:
  1. Read project structure: check for `entities/`, `prisma/schema.prisma`, `index.js`, `.env`
  2. Check each entity folder:
     - Folder name is plural lowercase with hyphens?
     - Router file matches folder name? (e.g., `products/products.js`)
     - Router exports `{ router }`? (not `default`)
     - Service file naming correct? (`{singular}.service.js`)
     - Schema file naming correct? (`{singular}.schema.js`)
  3. Check Prisma schema:
     - Every entity has a matching Prisma model?
     - Models have required fields: `id Int @id @default(autoincrement())`
     - Models have `@@map()` with correct table name?
     - Relations have matching FK fields?
  4. Check `setupRoute` calls:
     - Model name is camelCase (first letter lowercase)?
     - Not PascalCase or kebab-case?
  5. Check .env:
     - `ACCESS_TOKEN_SECRET` is set and >= 32 chars?
     - `DATABASE_URL` is set?
     - `MASTER_TOKEN` is >= 32 chars if set?
  6. Report all findings:
     - Errors (will break): missing files, wrong naming, missing exports
     - Warnings (may cause issues): missing indexes, no schema validation
     - Suggestions: missing metas field, no uid field
  7. For each error, provide the exact fix

---

**Command: `/primate test <entity>`**
- Usage: `/primate test product`
- Steps:
  1. Apply naming conventions
  2. Read entity router to find custom endpoints beyond CRUDAG
  3. Read Prisma model to build sample data payloads
  4. Ask: curl commands or test file?
  5. For curl commands, generate:
     - `POST /{plural}` — create with sample data
     - `GET /{plural}` — list all
     - `GET /{plural}?page=1&limit=5` — paginated
     - `GET /{plural}?q=searchterm` — search (if queryableFields)
     - `GET /{plural}?with=relation` — with relations (if relations exist)
     - `GET /{plural}/:id` — get by ID
     - `PUT /{plural}/:id` — update
     - `DELETE /{plural}/:id` — delete
     - Each custom endpoint from the router
  6. Include auth headers: `Authorization: Bearer $TOKEN`
  7. For test file, generate a simple Node.js script using `fetch()` that runs each request sequentially

---

**Error Handling section** in SKILL.md must cover:
- Entity folder already exists → ask to overwrite
- Prisma model already exists → warn, ask to update
- Invalid model name (not PascalCase) → reject, show correct format
- Missing prisma/schema.prisma → suggest `/primate init`
- Service/schema file already exists → ask to overwrite

**References section** points to all 6 reference files with brief descriptions of what each contains.

**Step 2: Review the SKILL.md for accuracy**

Cross-reference against actual source code:
- Verify all import paths match `src/index.js` exports
- Verify hook signatures match `src/lib/service.js`
- Verify setupRoute options match `prepareCrUDAGRoutes` in service.js
- Verify auth middleware names match `src/middlewares/auth.js`
- Verify naming convention logic matches `src/lib/controller.js` constructor

**Step 3: Commit**

```bash
git add claude-code/skills/primate/SKILL.md
git commit -m "feat: rewrite /primate skill with 10 comprehensive commands"
```

---

### Task 2: Update entity-templates.md

**Files:**
- Replace: `claude-code/skills/primate/references/entity-templates.md`

**Step 1: Write the updated entity-templates.md**

Update the existing file with these additions/changes:

1. **Router template** — add `disableMetasAuth` to the auth options comment block, it was missing from the old version. Verify against `service.js:prepareCrUDAGRoutes` which accepts: `disableAuth`, `disableCreateAuth`, `disableUpdateAuth`, `disableDeleteAuth`, `disableAllAuth`, `disableGetAuth`, `disableMetasAuth`.

2. **Router with custom endpoints** — add example using `with` parameter in a custom endpoint:
```javascript
router.get('/with-details', async (req, res) => {
    const result = await PrimateService.all('product', {
        ...req.query,
        with: 'category,reviews.user(name)'
    });
    res.respond({ data: result.data, count: result.count });
});
```

3. **Service template (all 10 hooks)** — update the basic service template to include stubs for ALL 10 hooks:
`beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeAll`, `afterAll`, `beforeGet`, `afterGet`

4. **Slug generation template** — keep and verify against product.service.js example

5. **Password hashing template** — keep and verify, ensure bcrypt import

6. **NEW: Computed fields template** — service that adds calculated properties in afterGet/afterAll:
```javascript
static async afterGet(record, options = {}) {
    if (!record) return record;
    record.displayName = `${record.firstName} ${record.lastName}`;
    record.isExpired = record.expiresAt && new Date(record.expiresAt) < new Date();
    return record;
}
```

7. **NEW: Soft delete template** — service with beforeDelete override:
```javascript
static async beforeDelete(data, options = {}) {
    // Instead of deleting, mark as deleted
    await PrimateService.update('post', data.id, {
        isDeleted: true,
        deletedAt: new Date()
    });
    throw new Error('SOFT_DELETE'); // Prevent actual deletion
}
```

8. **NEW: Dependency check template** — beforeDelete that checks for related records

9. **Schema templates** — keep existing basic and user registration schemas, add product schema

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/entity-templates.md
git commit -m "feat: update entity templates with all hooks, computed fields, soft delete"
```

---

### Task 3: Update api-patterns.md

**Files:**
- Replace: `claude-code/skills/primate/references/api-patterns.md`

**Step 1: Write the updated api-patterns.md**

Changes from current version:

1. **CRUDAG table** — add `GET /crudag` endpoint (status check), it exists in `prepareCrUDAGRoutes` but was missing from the docs.

2. **With parameter section** — expand significantly based on `_parseWithParam` in service.js:
   - Document the exact regex validation: `/^[\w.]+(\([\w,\s]+\))?$/`
   - Document that camelCase is required (handled by `changeCase.camelCase` internally)
   - Add examples for all 4 patterns: simple, nested, with select, combined nested+select

3. **Field filters section** — add these filter types based on `_buildFieldFilters`:
   - Comma-separated → IN: `?status=active,draft` → `{ in: ['active', 'draft'] }`
   - Pipe-separated → has: `?tags=tech|science` → `{ has: ['tech', 'science'] }`
   - Range → gte/lte: `?price=10..50` → `{ gte: 10, lte: 50 }`
   - Date range: `?created=2024-01-01..2024-12-31`

4. **Select parameter** — document that `select` and `with`/`include` can be used together (checked in service.js)

5. **Count parameter** — `?count=true` returns `{ data: [], count: N }`

6. **Response format** — add `requestId` and `meta.responseTime` fields (added by `setupPrimateMiddleware`)

7. **Custom route patterns** — add `masterOnly` import path correction and `hasPermission` example

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/api-patterns.md
git commit -m "feat: update API patterns with full filter syntax and with parameter"
```

---

### Task 4: Update prisma-snippets.md

**Files:**
- Replace: `claude-code/skills/primate/references/prisma-snippets.md`

**Step 1: Write the updated prisma-snippets.md**

Changes from current version:

1. **FK naming convention** — CRITICAL: Primate's ORM relation detection in `primate.js:addOneToManyRelations` looks for fields named `id{OtherModelPascalCase}`. The convention is `idUser`, `idPost`, `idCategory` — NOT `userId`. Document this prominently.

2. **Soft delete pattern** — already exists but add the service integration code alongside it

3. **The existing content is solid** — keep all current sections (basic model, field types, relations, indexes, common models, MySQL annotations)

4. **Add: Configuration model** — common pattern for app settings stored in DB

5. **Add: File/Media model** — common pattern for file uploads

6. **Verify all relation patterns** use `id{Parent}` FK naming

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/prisma-snippets.md
git commit -m "feat: update Prisma snippets with FK naming convention and new patterns"
```

---

### Task 5: Create debugging-guide.md (NEW)

**Files:**
- Create: `claude-code/skills/primate/references/debugging-guide.md`

**Step 1: Write debugging-guide.md**

This is a comprehensive troubleshooting reference. Structure:

**1. Entity Not Loading**
- Symptoms: 404 on entity endpoints, "Entity not found"
- Diagnostic steps:
  1. Check folder name: must be plural lowercase with hyphens (`products/`, `blog-posts/`)
  2. Check file name: must match folder (`products/products.js`, NOT `products/product.js`)
  3. Check export: must be `export { router }`, NOT `export default router` — the framework checks for `module.router || module.default` but named export is the convention
  4. Check `entitiesDir` in setup config matches actual directory
- Source reference: `primate.js:importEntities` (line ~458) — reads directory, expects `{dir}/{folder}/{folder}.js`

**2. Model Not Found**
- Error: `Model "xxx" not found. Available models: ...`
- Diagnostic steps:
  1. Check Prisma model exists and is PascalCase
  2. Check `setupRoute` uses camelCase (first letter lowercase): `'blogPost'` not `'BlogPost'`
  3. Run `npx prisma generate` after schema changes
  4. Check that `_validateModel` in service.js lowercases the first letter
- Source reference: `service.js:_validateModel` (line ~139)

**3. Prisma Errors**
- `P2002`: Unique constraint violation → check unique fields
- `P2003`: Foreign key constraint → related record doesn't exist
- `P2025`: Record not found → check ID before update/delete
- `P2021`: Table not found → run `npx prisma db push`
- Include exact error handling code

**4. Authentication Errors**
- 401 No authorization header → missing `Authorization` header
- 401 Invalid format → not `Bearer <token>` format
- 401 Token expired → check `JWT_EXPIRES_IN` (default: 24h)
- 401 Invalid token → `ACCESS_TOKEN_SECRET` mismatch between sign/verify
- Master token issues → check MASTER_TOKEN env var, minimum 32 chars
- Source reference: `auth.js` middleware flow

**5. Relation Errors with `with` Parameter**
- "Relation not found" → check Prisma schema has the relation defined
- Wrong case → use camelCase: `?with=blogPost` not `?with=blog-post` (handled by `changeCase.camelCase` in `_buildNestedInclude`)
- Invalid syntax → only `alphanumeric`, `.`, `(`, `)` allowed per regex in `_parseWithParam`
- Source reference: `service.js:_parseWithParam` and `_buildIncludeObject`

**6. Validation Errors**
- Schema file not found → check path: `entities/{plural}/{singular}.schema.js`
- Schema not JOI → must have `.validateAsync()` method
- Unknown fields stripped → `stripUnknown: true` is set in `Primate.validateSchema`
- Source reference: `primate.js:validateSchema` (line ~649)

**7. Service Not Loading**
- Custom service not called → check file path: `entities/{plural}/{singular}.service.js`
- Export must be `export default {ClassName}`
- Controller looks for service at: `./entities/{plural}/{singular}.service.js`
- Source reference: `controller.js:_loadDynamicService` (line ~86)

**8. Common Diagnostic Commands**
```bash
# Check Prisma can connect
npx prisma db pull

# Check Prisma models are current
npx prisma generate

# Check for schema drift
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma

# Check environment variables
node -e "console.log('ACCESS_TOKEN_SECRET:', !!process.env.ACCESS_TOKEN_SECRET)"
node -e "console.log('DATABASE_URL:', !!process.env.DATABASE_URL)"

# Check entity structure
ls -la entities/*/
```

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/debugging-guide.md
git commit -m "feat: add comprehensive debugging guide for Primate"
```

---

### Task 6: Create auth-patterns.md (NEW)

**Files:**
- Create: `claude-code/skills/primate/references/auth-patterns.md`

**Step 1: Write auth-patterns.md**

Structure:

**1. JWT Overview**
- Primate uses `jsonwebtoken` library
- Token payload is wrapped: `jwt.sign({ payload }, secret, options)`
- Verified token resolves to `{ payload: { ...claims } }`
- User object on request: `req.user = { type: 'jwt'|'master', payload: { id, role, permissions } }`
- Source: `utils/jwt.js` and `middlewares/auth.js`

**2. JWT Configuration**
- `ACCESS_TOKEN_SECRET` — signing secret (required, min 32 chars)
- `JWT_EXPIRES_IN` — token lifetime (default: '24h')
- `JWT_ISSUER` — issuer claim (default: 'primate-api')
- `JWT_ALGORITHM` — signing algorithm (default: 'HS256')

**3. Login Endpoint Template**
```javascript
// routes/auth.js
import { Router } from 'express';
import { PrimateService, jwt } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

const router = Router();

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.respond({ status: 400, message: 'Email and password are required' });
        }

        const user = await PrimateService.findBy('user', { email });
        if (!user) {
            return res.respond({ status: 401, message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.respond({ status: 401, message: 'Invalid credentials' });
        }

        const token = await jwt.signAccessToken({
            id: user.id,
            role: user.role || 'user',
            permissions: JSON.parse(user.permissions || '[]'),
        });

        // Remove sensitive fields before returning
        delete user.password;

        res.respond({ data: { token, user }, message: 'Login successful' });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});

export default router;
```

**4. Register Endpoint Template**
```javascript
router.post('/register', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if (!email || !password) {
            return res.respond({ status: 400, message: 'Email and password are required' });
        }

        // Check if user already exists
        const existing = await PrimateService.findBy('user', { email });
        if (existing) {
            return res.respond({ status: 409, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await PrimateService.create('user', {
            email,
            username: username || email.split('@')[0],
            password: hashedPassword,
            status: 'active',
        });

        const token = await jwt.signAccessToken({
            id: user.id,
            role: user.role || 'user',
            permissions: [],
        });

        delete user.password;

        res.respond({
            status: 201,
            data: { token, user },
            message: 'Registration successful',
        });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});
```

**5. Get Current User Template**
```javascript
import auth from '@thewebchimp/primate';

router.get('/me', auth, async (req, res) => {
    try {
        const user = await PrimateService.findById('user', req.user.payload.id);
        if (!user) {
            return res.respond({ status: 404, message: 'User not found' });
        }
        delete user.password;
        res.respond({ data: user });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});
```

**6. Auth Middleware Reference**
- `auth` — requires any valid token (JWT or master)
- `masterOnly` — requires master token only
- `hasPermission(req, 'permName')` — checks `req.user.payload.permissions` array, master token always passes
- `isMasterToken(req)` — returns boolean

**7. Master Token Pattern**
- Set `MASTER_TOKEN` in .env (min 32 chars)
- Use as Bearer token: `Authorization: Bearer <master_token>`
- Master user gets: `{ id: 0, role: 'master', permissions: ['*'], isMaster: true }`
- `LOG_MASTER_TOKEN_USAGE=true` to log usage

**8. Permission Check Pattern**
```javascript
router.post('/admin/action', auth, async (req, res) => {
    if (!hasPermission(req, 'admin:write')) {
        return res.respond({ status: 403, message: 'Insufficient permissions' });
    }
    // ... admin action
});
```

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/auth-patterns.md
git commit -m "feat: add auth patterns reference with login, register, and permission examples"
```

---

### Task 7: Create project-init-template.md (NEW)

**Files:**
- Create: `claude-code/skills/primate/references/project-init-template.md`

**Step 1: Write project-init-template.md**

Templates for `/primate init`:

**1. index.js**
```javascript
import Primate from '@thewebchimp/primate';

const primate = new Primate();

await primate.setup({
    entitiesDir: './entities',
    prismaClientLocation: '@prisma/client',
});

await primate.routes('./routes');

primate.start(process.env.PORT || 3000, (server, port) => {
    console.log(`Server running on port ${port}`);
});
```

**2. .env**
```env
# Required
ACCESS_TOKEN_SECRET=change-this-to-a-secure-random-string-at-least-32-chars
DATABASE_URL=mysql://root:password@localhost:3306/myapp

# Server
PORT=3000
NODE_ENV=development

# Optional Authentication
# MASTER_TOKEN=change-this-to-a-secure-random-string-at-least-32-chars
# LOG_MASTER_TOKEN_USAGE=true

# Optional API Settings
# DEFAULT_PAGE_LIMIT=100
# MAX_PAGE_LIMIT=1000

# Optional JWT Settings
# JWT_EXPIRES_IN=24h
# JWT_ISSUER=my-api
```

**3. prisma/schema.prisma**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// Add your models below
```

**4. package.json**
```json
{
  "name": "my-primate-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "db:push": "npx prisma db push",
    "db:generate": "npx prisma generate",
    "db:migrate": "npx prisma migrate dev",
    "db:studio": "npx prisma studio"
  },
  "dependencies": {
    "@thewebchimp/primate": "^1.2.5",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0"
  }
}
```

**5. Directory structure**
```
project-root/
├── entities/          # Entity modules (auto-discovered)
├── routes/            # Custom routes
├── prisma/
│   └── schema.prisma  # Database schema
├── index.js           # Entry point
├── .env               # Environment variables
└── package.json
```

**Step 2: Commit**

```bash
git add claude-code/skills/primate/references/project-init-template.md
git commit -m "feat: add project init template with index.js, .env, and Prisma setup"
```

---

### Task 8: Final review and integration commit

**Files:**
- Verify all files in `claude-code/skills/primate/`

**Step 1: Verify file structure**

Run `ls -la claude-code/skills/primate/` and `ls -la claude-code/skills/primate/references/` to confirm all 7 files exist:
- `SKILL.md`
- `references/entity-templates.md`
- `references/api-patterns.md`
- `references/prisma-snippets.md`
- `references/debugging-guide.md`
- `references/auth-patterns.md`
- `references/project-init-template.md`

**Step 2: Cross-reference consistency**

Check that:
1. Every command in SKILL.md references the correct reference file
2. Import paths in all templates use `@thewebchimp/primate`
3. Naming convention table in SKILL.md matches examples in all reference files
4. Hook signatures match: `static async hookName(data, options = {})` (before hooks) and `static async hookName(record, options = {})` (after hooks)
5. setupRoute options match source: `disableAuth`, `disableCreateAuth`, `disableUpdateAuth`, `disableDeleteAuth`, `disableAllAuth`, `disableGetAuth`, `disableMetasAuth`
6. FK naming is consistently `id{Parent}` everywhere (not `{parent}Id`)

**Step 3: Verify no duplicate content with CLAUDE.md**

The skill should complement, not duplicate CLAUDE.md. SKILL.md provides commands (actions), CLAUDE.md provides passive context. There will be some overlap (naming conventions, response format) which is fine — the skill needs to be self-contained.

**Step 4: Final commit (if any fixes needed)**

```bash
git add claude-code/skills/primate/
git commit -m "fix: final review corrections for /primate skill"
```

---

## Execution Notes

- Tasks 1-7 are independent and can be executed in parallel (tasks 2-7 write to separate files)
- Task 8 depends on all previous tasks completing
- No automated tests exist for Claude Code skills — verification is manual review against source code
- The SKILL.md (Task 1) is the most critical deliverable and the largest file
- Reference files (Tasks 2-7) should be accurate to the source code — cross-reference `src/` files

## Source Files to Reference During Implementation

| Source File | What It Tells Us |
|-------------|-----------------|
| `src/index.js` | Available exports from `@thewebchimp/primate` |
| `src/lib/primate.js` | Entity discovery, route setup, naming, ORM generation |
| `src/lib/service.js` | CRUDAG operations, hooks, `with` parameter parsing, field filters, setupRoute options |
| `src/lib/controller.js` | Service loading, naming conversion (camelCase→kebab→plural), input processing |
| `src/middlewares/auth.js` | Auth middleware, master token, permission checking |
| `src/utils/jwt.js` | Token signing/verification API |
| `src/utils/config.js` | All environment variables with defaults |
