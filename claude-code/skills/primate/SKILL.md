---
name: primate
description: Comprehensive Primate framework skill — scaffolding, debugging, auth, migrations, and testing. Use for any task involving the Primate framework (@thewebchimp/primate).
---

# Primate Framework Skill

## Framework Context

**Primate** is a Node.js REST API framework built on **Express.js + Prisma**. It auto-generates **CRUDAG endpoints** (Create, Read, Update, Delete, All, Get) from Prisma models, drastically reducing boilerplate for REST APIs.

### Key Exports

```js
// Core framework
import { Primate, PrimateService, PrimateController, auth, jwt } from '@thewebchimp/primate';

// Auth middleware (additional named exports)
import { masterOnly, isMasterToken, hasPermission } from '@thewebchimp/primate/src/middlewares/auth.js';
```

### Entity Auto-Discovery

Primate automatically discovers entities from the `entities/` directory. Each entity lives in its own folder following this structure:

```
entities/
  {plural}/
    {plural}.js              # Router file (required) — registers CRUDAG routes
    {singular}.service.js    # Custom service hooks (optional)
    {singular}.schema.js     # Joi validation schema (optional)
```

The router file must call `Primate.setupRoute('{camelCaseSingular}', router, options)` to register the standard CRUDAG endpoints.

### setupRoute Options

`Primate.setupRoute(model, router, options)` accepts these options:

| Option | Type | Description |
|--------|------|-------------|
| `searchField` | `string[]` | Fields to search when ID is non-numeric (e.g., slug, username) |
| `queryableFields` | `string[]` | Fields searchable via `?q=` parameter |
| `disableAuth` | `boolean` | Disable auth for ALL endpoints |
| `disableCreateAuth` | `boolean` | Disable auth for `POST /` |
| `disableAllAuth` | `boolean` | Disable auth for `GET /` |
| `disableGetAuth` | `boolean` | Disable auth for `GET /:id` |
| `disableUpdateAuth` | `boolean` | Disable auth for `PUT /:id` |
| `disableDeleteAuth` | `boolean` | Disable auth for `DELETE /:id` |
| `disableMetasAuth` | `boolean` | Disable auth for `PUT /:id/metas` |

### Standardized Responses -- res.respond()

All endpoints must use `res.respond()` for consistent JSON output:

```js
res.respond({ data });           // 200 success
res.respond({ data, status: 201, message: 'Created' });
res.respond({ error: true, message: 'Not found', status: 404 });
```

Response shape:

```json
{
  "result": "success|error",
  "status": 200,
  "message": "OK",
  "data": {},
  "count": null,
  "meta": {},
  "timestamp": "2025-01-01T00:00:00.000Z",
  "requestId": "uuid"
}
```

### Custom Services and Schemas

- Custom services live at `entities/{plural}/{singular}.service.js`
- Validation schemas live at `entities/{plural}/{singular}.schema.js`
- Both are auto-detected by Primate when they follow the naming convention

### PrimateService Methods

Available static methods on `PrimateService`:

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `create(model, data)` | Create a record |
| `update` | `update(model, id, data)` | Update a record by ID |
| `delete` | `delete(model, id)` | Delete a record by ID |
| `get` | `get(model, id, options)` | Get a single record by ID |
| `all` | `all(model, options)` | Get all records with filtering |
| `findById` | `findById(model, id, options)` | Find a record by ID |
| `findBy` | `findBy(model, field, value, options)` | Find records by field value |
| `updateMetas` | `updateMetas(model, id, metas)` | Update the metas JSON field |

---

## Naming Convention Rules

**This table is critical.** Every command that accepts an entity name MUST apply these conventions consistently.

### Conversion Table

| Input | Prisma Model | Folder | Router File | Service File | Schema File | setupRoute | DB Table (@@map) |
|-------|-------------|--------|-------------|--------------|-------------|------------|-----------------|
| `Product` | `Product` | `products/` | `products.js` | `product.service.js` | `product.schema.js` | `'product'` | `product` |
| `BlogPost` | `BlogPost` | `blog-posts/` | `blog-posts.js` | `blog-post.service.js` | `blog-post.schema.js` | `'blogPost'` | `blog_post` |
| `OrderItem` | `OrderItem` | `order-items/` | `order-items.js` | `order-item.service.js` | `order-item.schema.js` | `'orderItem'` | `order_item` |
| `Category` | `Category` | `categories/` | `categories.js` | `category.service.js` | `category.schema.js` | `'category'` | `category` |
| `Person` | `Person` | `people/` | `people.js` | `person.service.js` | `person.schema.js` | `'person'` | `person` |

### Conversion Rules

1. **PascalCase to kebab-case**: Insert a hyphen before each uppercase letter (except the first), then lowercase everything.
   - `BlogPost` -> `blog-post`
   - `OrderItem` -> `order-item`
   - `Product` -> `product`

2. **Singular to Plural**: Apply standard English pluralization rules.
   - `product` -> `products`
   - `category` -> `categories`
   - `person` -> `people`
   - `blog-post` -> `blog-posts`

3. **Folder and Router**: Use the **kebab-case plural** form.
   - Folder: `entities/{kebab-plural}/`
   - Router file: `entities/{kebab-plural}/{kebab-plural}.js`

4. **Service and Schema files**: Use the **kebab-case singular** form.
   - Service: `entities/{kebab-plural}/{kebab-singular}.service.js`
   - Schema: `entities/{kebab-plural}/{kebab-singular}.schema.js`

5. **setupRoute parameter**: Use **camelCase** (PascalCase with first letter lowered).
   - `Product` -> `'product'`
   - `BlogPost` -> `'blogPost'`
   - `OrderItem` -> `'orderItem'`

6. **DB table (@@map)**: Use **snake_case** -- take the kebab-case singular and replace hyphens with underscores.
   - `product` -> `product`
   - `blog-post` -> `blog_post`
   - `order-item` -> `order_item`

---

## Commands

---

### 1. `/primate init`

**Usage:** `/primate init`

**Example:** `/primate init`

Scaffolds a new Primate project in the current directory.

**Steps:**

1. Check if `package.json` already exists in the working directory. If it does, warn the user that this will overwrite existing files and ask for confirmation before proceeding.
2. Create the following directories if they do not already exist:
   - `entities/`
   - `routes/`
   - `prisma/`
3. Write the following files using templates from `references/project-init-template.md`:
   - `index.js` -- Main entry point with Primate initialization
   - `.env` -- Environment variables template (DB connection, JWT secret, port)
   - `prisma/schema.prisma` -- Base Prisma schema with a User model
   - `package.json` -- Project manifest with `@thewebchimp/primate` dependency
4. Run `yarn install` to install dependencies.
5. Run `npx prisma generate` to generate the Prisma client.
6. Display a summary of all created files and directories.

**Files Created:**

- `index.js`
- `.env`
- `prisma/schema.prisma`
- `package.json`
- `entities/` (directory)
- `routes/` (directory)

**Reminders:**

- Tell the user to update `.env` with their actual database connection string, JWT secret, and desired port.
- Remind them to run `npx prisma db push` or `npx prisma migrate dev` to sync the schema with their database.
- Mention that the default User model is included and they can add entities with `/primate entity`.

---

### 2. `/primate entity <Name>`

**Usage:** `/primate entity <PascalCaseName>`

**Example:** `/primate entity BlogPost`

Creates a complete entity -- Prisma model, router, and optionally service and schema files.

**Steps:**

1. **Apply naming conventions** from the conversion table. For example, given input `BlogPost`:
   - Model: `BlogPost`
   - Folder: `blog-posts/`
   - Router: `blog-posts.js`
   - Service: `blog-post.service.js`
   - Schema: `blog-post.schema.js`
   - setupRoute: `'blogPost'`
   - DB table: `blog_post`

2. **Ask the user for fields.** For each field, collect:
   - `name` (camelCase)
   - `type` (String, Int, Float, Boolean, DateTime, Json)
   - `required` (yes/no -- maps to `?` optional marker in Prisma)
   - `unique` (yes/no)
   - `default` value (if any)

3. **Suggest standard fields** that most entities benefit from. The user can accept or decline each:
   - `uid String @unique @default(uuid())` -- Public unique identifier
   - `metas Json? @default("{}")` -- Flexible metadata JSON field
   - `createdAt DateTime @default(now()) @map("created_at")`
   - `modifiedAt DateTime @updatedAt @map("modified_at")`

4. **Detect relations.** If any field name starts with `id` followed by an uppercase letter (e.g., `idUser`, `idCategory`), automatically:
   - Add the FK field as `Int`
   - Add the relation: `{parent} {Parent} @relation(fields: [id{Parent}], references: [id])`
   - Add `@@index([id{Parent}])` to the model

5. **Create the entity folder** at `entities/{kebab-plural}/`.

6. **Write the router file** at `entities/{kebab-plural}/{kebab-plural}.js`:
   - Import `PrimateController` from `@thewebchimp/primate`
   - Create an Express router
   - Call `Primate.setupRoute('{camelCase}', router)`
   - Set `queryableFields` from any `String` type fields (for filtering via query params)
   - Set `searchField` to `slug` if a slug field exists, or `email` if an email field exists
   - Export the router
   - Reference `references/entity-templates.md` for the exact template

7. **Append the Prisma model** to `prisma/schema.prisma`:
   - Include all user-specified fields
   - Include accepted standard fields
   - Add `@@map("{snake_case_table_name}")`
   - Add `@@index` entries for any FK fields
   - Reference `references/prisma-snippets.md` for model patterns

8. **Ask if the user wants a custom service file.** If yes, proceed with the `/primate service` flow for this entity.

9. **Ask if the user wants a schema (validation) file.** If yes, proceed with the `/primate schema` flow for this entity.

10. **Remind** the user to run `npx prisma generate` (and `npx prisma db push` or `npx prisma migrate dev`) to apply changes.

**Files Created:**

- `entities/{kebab-plural}/{kebab-plural}.js` (router)
- Appended model to `prisma/schema.prisma`
- Optionally: `entities/{kebab-plural}/{kebab-singular}.service.js`
- Optionally: `entities/{kebab-plural}/{kebab-singular}.schema.js`

**Reminders:**

- Run `npx prisma generate` after modifying `schema.prisma`.
- Run `npx prisma db push` or `npx prisma migrate dev` to sync to the database.
- The entity will be auto-discovered on next server restart.

---

### 3. `/primate service <name>`

**Usage:** `/primate service <PascalCaseName>`

**Example:** `/primate service BlogPost`

Creates a custom service file with lifecycle hooks for an entity.

**Steps:**

1. **Apply naming conventions** to determine file paths.

2. **Check that the entity folder exists** at `entities/{kebab-plural}/`. If it does not exist, warn the user and suggest running `/primate entity` first.

3. **Ask which hook patterns** the user needs (they can select multiple):
   - **Slug generation** -- Auto-generate a URL-friendly slug from a title/name field in `beforeCreate` and `beforeUpdate`
   - **Password hashing** -- Hash passwords with bcrypt in `beforeCreate` and `beforeUpdate`
   - **Sensitive field removal** -- Strip passwords/tokens from responses in `afterGet` and `afterAll`
   - **Computed fields** -- Add virtual/calculated fields in `afterGet`
   - **Soft delete** -- Override delete to set a `deletedAt` timestamp in `beforeDelete`
   - **Dependency check** -- Prevent deletion if related records exist in `beforeDelete`
   - **Basic hooks** -- Empty `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete` stubs

4. **Read the Prisma model** from `prisma/schema.prisma` to understand available fields, types, and relations. Use this information to customize hook implementations (e.g., which field to slugify, which field to hash).

5. **Write the service file** at `entities/{kebab-plural}/{kebab-singular}.service.js`:
   - Class name: `{ModelName}Service` (e.g., `BlogPostService`)
   - All hooks are `static async` methods
   - Hook signature: `static async hookName(data, options = {})`
   - End with `export default {ModelName}Service;`
   - Reference `references/entity-templates.md` for the service template

**Files Created:**

- `entities/{kebab-plural}/{kebab-singular}.service.js`

**Reminders:**

- Service hooks are automatically detected by Primate when the file follows the naming convention.
- Available hook names: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeGet`, `afterGet`, `beforeAll`, `afterAll`.
- The `data` parameter contains the request body (for create/update) or the record (for get/delete).

---

### 4. `/primate schema <name>`

**Usage:** `/primate schema <PascalCaseName>`

**Example:** `/primate schema BlogPost`

Generates a Joi validation schema by reading the Prisma model.

**Steps:**

1. **Apply naming conventions** to determine file paths.

2. **Read `prisma/schema.prisma`** and locate the model matching the PascalCase name.

3. **Extract fields** from the Prisma model -- name, type, constraints (required, unique, default).

4. **Map Prisma types to Joi validators:**

   | Prisma Type | Joi Validator |
   |-------------|---------------|
   | `String` | `Joi.string()` |
   | `Int` | `Joi.number().integer()` |
   | `Float` | `Joi.number()` |
   | `Boolean` | `Joi.boolean()` |
   | `DateTime` | `Joi.date().iso()` |
   | `Json` | `Joi.object()` |

5. **Skip these fields** -- they are auto-managed and must not appear in the validation schema:
   - `id`
   - `uid`
   - `createdAt` / `created_at`
   - `modifiedAt` / `modified_at`
   - `metas`
   - Any relation fields (fields referencing other models)

6. **Apply constraints:**
   - If the field has no `?` (is required) and has no `@default`, add `.required()`
   - If the field has `@unique`, note it in a comment
   - If the field is an email, add `.email()`
   - If the field is a URL, add `.uri()`

7. **Write the schema file** at `entities/{kebab-plural}/{kebab-singular}.schema.js`:
   - Variable name: `{modelName}Schema` (camelCase + "Schema", e.g., `blogPostSchema`)
   - End with `export default {modelName}Schema;`
   - Reference `references/entity-templates.md` for the schema template

**Files Created:**

- `entities/{kebab-plural}/{kebab-singular}.schema.js`

**Reminders:**

- The schema is automatically used by Primate for request validation when it follows the naming convention.
- Add custom validation rules as needed (regex patterns, min/max, allowed values, etc.).

---

### 5. `/primate relation <Parent> <Child>`

**Usage:** `/primate relation <ParentModel> <ChildModel>`

**Example:** `/primate relation User BlogPost`

Adds a relationship between two existing Prisma models.

**Steps:**

1. **Validate both models exist** in `prisma/schema.prisma`. If either is missing, report the error and stop.

2. **Ask the relation type:**
   - **One-to-many** (default) -- One Parent has many Children (e.g., one User has many BlogPosts)
   - **One-to-one** -- One Parent has one Child
   - **Many-to-many** -- Uses an implicit join table

3. **For one-to-many or one-to-one**, modify `prisma/schema.prisma`:
   - Add FK field `id{Parent} Int` to the Child model (e.g., `idUser Int`)
   - Add relation field to the Child model: `{parent} {Parent} @relation(fields: [id{Parent}], references: [id])`
   - Add reverse relation to the Parent model: `{children} {Child}[]` (one-to-many) or `{child} {Child}?` (one-to-one)
   - Add `@@index([id{Parent}])` to the Child model

4. **For many-to-many**, modify `prisma/schema.prisma`:
   - Add `{children} {Child}[]` to the Parent model
   - Add `{parents} {Parent}[]` to the Child model

5. **FK naming rule**: The foreign key field MUST be named `id{Parent}` (e.g., `idUser`, `idCategory`). This matches the framework's ORM detection pattern. Do NOT use `{parent}Id` or other naming conventions.

6. **Remind** the user to run `npx prisma generate` and sync the database.

7. **Show `with` parameter examples** for querying with relations:
   ```
   GET /api/v1/{children}?with=id{Parent}
   GET /api/v1/{children}/{id}?with=id{Parent}
   ```

**Files Modified:**

- `prisma/schema.prisma` (both models updated)

**Reminders:**

- Run `npx prisma generate` after modifying relations.
- Run `npx prisma db push` or `npx prisma migrate dev` to apply.
- Use the `with` query parameter in API calls to include related data.
- Reference `references/prisma-snippets.md` for relation patterns.

---

### 6. `/primate endpoint <entity>`

**Usage:** `/primate endpoint <PascalCaseName>`

**Example:** `/primate endpoint BlogPost`

Adds a custom endpoint to an existing entity's router file.

**Steps:**

1. **Apply naming conventions** to locate the router file at `entities/{kebab-plural}/{kebab-plural}.js`.

2. **Read the existing router file** to understand current endpoints and imports.

3. **Ask the user for endpoint details:**
   - HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
   - Path (e.g., `/featured`, `/:id/publish`, `/stats`)
   - Auth level: `none`, `auth` (requires valid JWT), `masterOnly` (requires master token)
   - Brief description of what the endpoint does

4. **Generate the endpoint code:**
   - Use `PrimateService` methods for data access
   - Wrap in a `try-catch` block
   - Use `res.respond()` for the response
   - Apply auth middleware if specified: `auth` or `masterOnly`

5. **Insert the endpoint** into the router file AFTER the `Primate.setupRoute()` call. Custom endpoints must come after the setupRoute call to avoid being overridden.

6. **Add any missing imports** at the top of the file (e.g., `PrimateService`, `auth`, `masterOnly`).

**Files Modified:**

- `entities/{kebab-plural}/{kebab-plural}.js`

**Reminders:**

- Custom endpoints are placed AFTER `setupRoute()` in the router file.
- Always use `res.respond()` -- never use `res.json()` directly.
- Always wrap endpoint logic in `try-catch`.
- Reference `references/entity-templates.md` for endpoint patterns.
- Reference `references/api-patterns.md` for query parameter handling.

---

### 7. `/primate auth <entity>`

**Usage:** `/primate auth <PascalCaseName>`

**Example:** `/primate auth User`

Sets up JWT authentication routes and service hooks for an entity (typically User).

**Steps:**

1. **Apply naming conventions** (typically the entity is `User`, but it could be any model).

2. **Check the entity exists** -- the folder and router file must already exist. If not, suggest running `/primate entity User` first.

3. **Create or update the service file** at `entities/{kebab-plural}/{kebab-singular}.service.js`:
   - Add `beforeCreate` hook with password hashing using bcrypt
   - Add `beforeUpdate` hook with conditional password hashing (only if the password field changed)
   - Add `afterGet` hook to strip password from responses
   - Add `afterAll` hook to strip passwords from list responses
   - Reference `references/auth-patterns.md` for implementation details

4. **Create the auth routes file** at `routes/auth.js`:
   - `POST /auth/login` -- Validate credentials, generate JWT, return token + user data
   - `POST /auth/register` -- Create user, hash password, generate JWT, return token + user data
   - `GET /auth/me` -- Protected route (requires `auth` middleware), return current user from JWT
   - Use `jwt.sign()` and `jwt.verify()` from Primate exports
   - Use `res.respond()` for all responses
   - Reference `references/auth-patterns.md` for the complete template

5. **Remind the user** to load the auth routes in `index.js`:
   ```js
   // In the Primate.setup() callback or after Primate.start():
   const authRoutes = require('./routes/auth');
   app.use('/api/v1', authRoutes);
   ```

**Files Created/Modified:**

- `entities/{kebab-plural}/{kebab-singular}.service.js` (created or updated)
- `routes/auth.js` (created)

**Reminders:**

- Make sure `JWT_SECRET` is set in `.env`.
- Load `routes/auth.js` in `index.js`.
- The `auth` middleware can be imported from `@thewebchimp/primate` and used on any route.
- Test with: `curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'`
- Reference `references/auth-patterns.md` for detailed JWT flow.

---

### 8. `/primate migrate`

**Usage:** `/primate migrate`

**Example:** `/primate migrate`

Manages Prisma database migrations and schema synchronization.

**Steps:**

1. **Read `prisma/schema.prisma`** to understand the current schema state.

2. **Ask the user which migration type** they want:
   - **Dev push** (`npx prisma db push`) -- Quick sync for development. Does not create migration files. Best for rapid prototyping.
   - **Migration** (`npx prisma migrate dev --name <name>`) -- Creates a migration file. Best for production-tracked changes. Ask the user for a migration name.
   - **Generate only** (`npx prisma generate`) -- Regenerate the Prisma client without touching the database. Use after manual schema edits.
   - **Reset** (`npx prisma migrate reset`) -- Drop all data and re-apply migrations. **DESTRUCTIVE.**

3. **If the user chose Reset**, display a prominent warning:
   ```
   WARNING: This will DROP ALL DATA in the database and re-apply all migrations.
   This action is IRREVERSIBLE. Are you sure? (yes/no)
   ```
   Only proceed if the user explicitly confirms.

4. **Run the appropriate command** and display the output.

5. **If there are errors**, check for common issues:
   - Connection refused -- Check `.env` `DATABASE_URL`
   - Schema validation errors -- Point to the specific line in `schema.prisma`
   - Data loss warnings -- Explain what data will be affected

**Files Modified:**

- `prisma/migrations/` (if using migrate dev)
- `node_modules/.prisma/` (regenerated client)

**Reminders:**

- After any migration, restart the development server.
- For production, always use `prisma migrate dev` (not `db push`) to track changes.
- Check `prisma/migrations/` directory for migration history.

---

### 9. `/primate debug`

**Usage:** `/primate debug`

**Example:** `/primate debug`

Inspects the project for common Primate configuration errors and suggests fixes.

**Steps:**

1. **Read the project structure.** List all directories and files under `entities/`, `routes/`, and `prisma/`.

2. **Check each entity** for these issues:
   - **Folder naming**: Must be kebab-case plural (e.g., `blog-posts/`, not `blogPosts/` or `BlogPosts/`)
   - **Router file naming**: Must match folder name (e.g., `blog-posts/blog-posts.js`)
   - **Router export format**: Must export an Express router via `module.exports = router` or `export { router }`
   - **setupRoute call**: Must use camelCase model name (e.g., `'blogPost'`, not `'BlogPost'` or `'blog-post'`)
   - **Service file naming**: Must be kebab-case singular + `.service.js` (e.g., `blog-post.service.js`)
   - **Schema file naming**: Must be kebab-case singular + `.schema.js` (e.g., `blog-post.schema.js`)
   - **Service class export**: Must `export default` the service class

3. **Check Prisma schema** for:
   - Every entity folder has a corresponding Prisma model
   - Every model has an `id Int @id @default(autoincrement())` field
   - Every model has `@@map("{snake_case}")` for table naming
   - Relations have matching FK fields and `@@index` entries
   - No orphaned models (models without entity folders -- warn but do not error)

4. **Check setupRoute calls** in each router file:
   - The string argument must be camelCase (first letter lowercase)
   - Must match the Prisma model name (with adjusted casing)

5. **Check `.env` variables:**
   - `DATABASE_URL` is set and non-empty
   - `JWT_SECRET` is set (if auth routes exist)
   - `PORT` is set

6. **Report results** in three categories:
   - **Errors** (will prevent the app from working): Show with exact fix instructions
   - **Warnings** (may cause issues): Show with recommendations
   - **Suggestions** (best practices): Show with improvement ideas

**Files Read:**

- All files in `entities/`
- `prisma/schema.prisma`
- `.env`
- `index.js`

**Reminders:**

- Fix errors first, then warnings.
- After fixing Prisma schema issues, run `npx prisma generate`.
- After fixing entity folder/file issues, restart the server.
- Reference `references/debugging-guide.md` for detailed troubleshooting.

---

### 10. `/primate test <entity>`

**Usage:** `/primate test <PascalCaseName>`

**Example:** `/primate test BlogPost`

Generates test requests (curl commands or test file) for all endpoints of an entity.

**Steps:**

1. **Apply naming conventions** to determine the API base path: `/api/v1/{kebab-plural}` (e.g., `/api/v1/blog-posts`).

2. **Read the router file** at `entities/{kebab-plural}/{kebab-plural}.js` to discover custom endpoints beyond CRUDAG.

3. **Read the Prisma model** from `prisma/schema.prisma` to generate realistic sample data for request bodies.

4. **Ask the user** for output format:
   - **curl commands** -- Generate copy-paste-ready curl commands
   - **Test file** -- Generate a `.http` file (VS Code REST Client) or `.test.js` file

5. **Generate test requests for all CRUDAG endpoints:**
   - `POST /api/v1/{plural}` -- Create (with sample body generated from Prisma fields)
   - `GET /api/v1/{plural}` -- Get All (with query params: `?page=1&limit=10`)
   - `GET /api/v1/{plural}/:id` -- Get by ID
   - `PUT /api/v1/{plural}/:id` -- Update (with partial body)
   - `DELETE /api/v1/{plural}/:id` -- Delete
   - `GET /api/v1/{plural}/all` -- Get all without pagination (if applicable)

6. **Generate test requests for custom endpoints** discovered in step 2.

7. **Include auth headers** where applicable:
   ```
   -H "Authorization: Bearer <token>"
   ```

8. **Include example `with` parameter** for entities with relations:
   ```
   GET /api/v1/{plural}?with=id{Parent}
   ```

**Files Created (optional):**

- `tests/{kebab-plural}.http` or `tests/{kebab-plural}.test.js`

**Reminders:**

- Replace `<token>` with an actual JWT from `/auth/login`.
- Replace `:id` with an actual record ID.
- Adjust sample data to match your field constraints.
- Reference `references/api-patterns.md` for all query parameters (page, limit, search, orderBy, with, etc.).

---

## Error Handling

When running any command, handle these common errors gracefully:

| Scenario | Response |
|----------|----------|
| **Entity folder already exists** | Ask the user if they want to overwrite existing files or skip. Never silently overwrite. |
| **Prisma model already exists** | Warn the user. Ask if they want to update the existing model or skip. Show the current model definition. |
| **Invalid model name** | Reject names that are not PascalCase (e.g., `blog_post`, `blogPost`, `blog-post`). Show the correct format: `BlogPost`. |
| **Missing `prisma/schema.prisma`** | The project is not initialized. Suggest running `/primate init` first. |
| **Service file already exists** | Ask the user if they want to overwrite or merge with existing hooks. |
| **Schema file already exists** | Ask the user if they want to overwrite or update the existing schema. |
| **Missing entity for service/schema** | Warn that the entity folder does not exist. Suggest creating the entity first with `/primate entity`. |
| **Database connection failed** | Check `.env` for `DATABASE_URL`. Suggest verifying the connection string and that the database server is running. |
| **Prisma schema validation error** | Point to the specific line and field causing the error. Suggest the corrected syntax. |

---

## References

These reference files contain code templates, patterns, and detailed examples. Consult them when generating code:

| File | Contents |
|------|----------|
| `references/entity-templates.md` | Router, service, and schema code templates with full examples |
| `references/api-patterns.md` | API endpoints, query parameters (`page`, `limit`, `search`, `orderBy`, `with`), response format details |
| `references/prisma-snippets.md` | Prisma model patterns, field types, relations, indexes, `@@map`, `@@index` examples |
| `references/debugging-guide.md` | Troubleshooting entity loading failures, Prisma errors, auth issues, common pitfalls |
| `references/auth-patterns.md` | JWT authentication flow, login/register templates, middleware usage, permissions |
| `references/project-init-template.md` | Boilerplate files for new Primate projects (`index.js`, `.env`, `schema.prisma`, `package.json`) |
