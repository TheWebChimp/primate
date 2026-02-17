# Debugging Guide

Comprehensive troubleshooting reference for Primate projects. Each section covers symptoms, diagnostic steps, and source code references so you can trace issues back to the framework internals.

## 1. Entity Not Loading

**Symptoms:**
- 404 on entity endpoints
- "Entity not found" errors
- Routes not registered at startup (no "Mounted {entity} routes" log message)

**Diagnostic steps:**

1. **Check folder name:** Must be plural, lowercase, with hyphens for multi-word names.
   ```
   entities/products/          # correct
   entities/blog-posts/        # correct
   entities/Product/           # WRONG - not plural, not lowercase
   entities/blogPosts/         # WRONG - must use hyphens, not camelCase
   ```

2. **Check file name:** Must match the folder name exactly (not the singular form).
   ```
   entities/products/products.js        # correct
   entities/blog-posts/blog-posts.js    # correct
   entities/products/product.js         # WRONG - must match folder name
   ```

3. **Check export:** Must export `router` as a named export. The framework checks `module.router || module.default`.
   ```javascript
   // Correct
   export { router };

   // Also works (but named export is the convention)
   export default router;

   // WRONG - no export
   // (forgot to export the router)
   ```

4. **Check `entitiesDir` in setup config:** The directory passed to `setup()` must match the actual directory on disk.
   ```javascript
   // If your entities live in ./entities (default), no config needed.
   // If they live elsewhere:
   await primate.setup({ entitiesDir: './src/entities' });
   ```

5. **Check startup logs:** Look for warning messages:
   - `"Entity file not found: {path}"` -- file naming mismatch
   - `"No router exported from {path}"` -- missing or wrong export
   - `"Entities directory not found: {path}"` -- wrong `entitiesDir`

**Source reference:** `primate.js:importEntities` (line ~458) reads the entities directory, iterates each subfolder, and expects the file at `{entitiesDir}/{folder}/{folder}.js`. It imports the module and looks for `module.router || module.default`.

---

## 2. Model Not Found

**Error:** `Model "xxx" not found. Available models: ...`

**Diagnostic steps:**

1. **Prisma model exists and uses PascalCase:**
   ```prisma
   // Correct
   model BlogPost { ... }

   // WRONG
   model blogPost { ... }
   model blog_post { ... }
   ```

2. **`setupRoute` uses camelCase (first letter lowercase):**
   ```javascript
   // Correct
   Primate.setupRoute('blogPost', router, { ... });

   // WRONG
   Primate.setupRoute('BlogPost', router, { ... });   // PascalCase
   Primate.setupRoute('blog-post', router, { ... });   // kebab-case
   Primate.setupRoute('blog_post', router, { ... });   // snake_case
   ```

3. **Run `npx prisma generate` after schema changes:** The Prisma client must be regenerated whenever you modify `schema.prisma`. Without this step, the ORM object will not include your new or renamed models.

4. **Understand the normalization:** `_validateModel` lowercases the first character of the model name, then checks if that key exists in the ORM object. The ORM object is built from `Prisma.dmmf.datamodel.models`, where each model's name has its first character lowercased: `BlogPost` becomes `blogPost`.

**Source reference:** `service.js:_validateModel` (line ~139) normalizes the model name with `model[0].toLowerCase() + model.slice(1)` and checks it against `this.orm`. If not found, it throws with the list of available models.

---

## 3. Prisma Errors

Common Prisma error codes and how to resolve them:

| Code | Meaning | Resolution |
|------|---------|------------|
| `P2002` | Unique constraint violation | A record with that value already exists. Check unique fields like `email`, `username`, `slug`. |
| `P2003` | Foreign key constraint failed | The related record does not exist. Verify the referenced ID exists before creating/updating. |
| `P2025` | Record not found | The record you are trying to update or delete does not exist. Check the ID before the operation. |
| `P2021` | Table does not exist in the database | Run `npx prisma db push` or `npx prisma migrate dev` to sync the schema. |
| `P2024` | Timed out fetching a connection | Database connection pool exhausted. Check `DATABASE_URL` and connection limits. |

**Error handling code example:**

```javascript
import { PrimateService } from '@thewebchimp/primate';

router.post('/', auth, async (req, res) => {
    try {
        const record = await PrimateService.create('product', req.body);
        res.respond({ status: 201, data: record });
    } catch (error) {
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0] || 'field';
            return res.respond({
                status: 409,
                message: `A record with this ${field} already exists`,
            });
        }
        if (error.code === 'P2003') {
            return res.respond({
                status: 400,
                message: 'Related record not found. Check foreign key values.',
            });
        }
        if (error.code === 'P2025') {
            return res.respond({
                status: 404,
                message: 'Record not found',
            });
        }
        res.respond({ status: 500, message: error.message });
    }
});
```

**Note:** Primate's `service.js:create`, `service.js:update`, and `service.js:delete` methods already handle P2002, P2003, and P2025 internally and convert them to appropriate HTTP errors (409, 400, 404). You only need custom handling in your own custom routes.

**Source reference:** `service.js:create` (line ~282), `service.js:update` (line ~352), `service.js:delete` (line ~426) each have catch blocks that translate Prisma error codes to HTTP errors.

---

## 4. Authentication Errors

**Error messages from `auth.js` middleware and their causes:**

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `"Unauthorized: No authorization header present."` | Missing `Authorization` header entirely | Add header: `Authorization: Bearer <token>` |
| `"Unauthorized: Invalid authorization format. Expected \"Bearer <token>\"."` | Header is not in `Bearer <token>` format | Use exactly `Bearer ` (with space) followed by the token |
| `"Unauthorized: Token has expired: ..."` | JWT has passed its expiration time | Issue a new token. Check `JWT_EXPIRES_IN` setting (default varies by implementation) |
| `"Unauthorized: Invalid token: ..."` | JWT is malformed, tampered with, or signed with a different secret | Verify `ACCESS_TOKEN_SECRET` matches between token signing and verification |
| `"Forbidden: Invalid master token."` | Token does not match `MASTER_TOKEN` env var (on `masterOnly` routes) | Check `MASTER_TOKEN` in `.env` matches exactly |
| `"Server Error: Master token not configured."` | `MASTER_TOKEN` env var is not set (on `masterOnly` routes) | Set `MASTER_TOKEN` in `.env` (minimum 32 characters recommended) |

**Debug checklist:**

1. **Header format:** Must be exactly `Authorization: Bearer <token>` (capital B, single space).
2. **Token type:** The `auth` middleware accepts both JWT tokens and master tokens. The `masterOnly` middleware only accepts the master token.
3. **Environment variables:**
   - `ACCESS_TOKEN_SECRET` -- must be set and identical between token signing and verification.
   - `MASTER_TOKEN` -- must be set if using master token authentication.
4. **Token payload after verification:** Check `req.user` structure:
   ```javascript
   // JWT token
   req.user = { type: 'jwt', payload: { id, role, permissions, ... } }

   // Master token
   req.user = { type: 'master', payload: { id: 0, role: 'master', permissions: ['*'], isMaster: true } }
   ```

**Source reference:** `src/middlewares/auth.js` -- the `auth` function (line ~12) handles the full flow: header check, Bearer format check, master token comparison, JWT verification. The `masterOnly` function (line ~89) is the master-token-only variant.

---

## 5. Relation Errors with `with` Parameter

**Common issues:**

### "Relation not found" warning

The `with` parameter value references a relation that does not exist on the Prisma model. Check that the relation is defined in `schema.prisma`:

```prisma
model Post {
    id     Int    @id @default(autoincrement())
    idUser Int
    user   User   @relation(fields: [idUser], references: [id])  // This defines the "user" relation
    @@map("post")
}
```

Without the `user User @relation(...)` line, `?with=user` will not work.

### Wrong case

The `with` parameter values are converted to camelCase internally via `changeCase.camelCase()`. Use camelCase relation names:

```
?with=blogPost        # correct
?with=blog-post       # WRONG - will be converted but may not match
?with=BlogPost        # WRONG - will be lowercased incorrectly
?with=blog_post       # WRONG
```

### Invalid syntax

Each relation entry in the `with` parameter is validated against the regex:

```
/^[\w.]+(\([\w,\s]+\))?$/
```

This means:
- Alphanumeric characters, underscores, and dots are allowed in the path
- Optionally followed by parentheses containing field names (comma-separated)
- Special characters like `@`, `!`, `#` are not allowed

**Valid examples:**
```
?with=user
?with=user,comments
?with=user.profile
?with=user(id,name)
?with=user.profile(bio,avatar)
?with=comments.author(name,email)
```

**Invalid examples:**
```
?with=user[0]           # brackets not allowed
?with=user->profile     # arrow syntax not allowed
?with=user(id|name)     # pipes not allowed inside parens
```

**Source reference:** `service.js:_parseWithParam` (line ~1080) parses the `with` string, validates each relation against the regex, and builds the Prisma include object. `service.js:_buildIncludeObject` (line ~1018) merges the parsed `with` includes with default includes and legacy `fetch-*` parameters.

---

## 6. Validation Errors

**Symptoms:** 400 Bad Request with "Validation failed" message.

### Schema file not found

Primate looks for the schema file at:

```
entities/{plural}/{singular}.schema.js
```

Where `{plural}` is the pluralized entity name and `{singular}` is the singular form. For example:
- `entities/products/product.schema.js`
- `entities/blog-posts/blog-post.schema.js`

If the schema file does not exist, Primate logs a warning (`Schema file not found for entity "..."`) but **does not block the operation** -- data passes through without validation.

### Schema must be a Joi object

The schema file must export a default Joi object that has a `.validateAsync()` method:

```javascript
// Correct
import Joi from 'joi';
const productSchema = Joi.object({ name: Joi.string().required() });
export default productSchema;

// WRONG - not a Joi schema
export default { name: 'string' };

// WRONG - named export instead of default
export const productSchema = Joi.object({ ... });
```

If the export does not have a `.validateAsync()` method, Primate throws: `Invalid schema export for entity "..."`.

### Unknown fields are stripped

Primate calls `schema.default.validateAsync(data, { abortEarly: false, stripUnknown: true })`. The `stripUnknown: true` option means any fields not defined in the Joi schema will be silently removed from the data before it reaches the database.

If a field is being silently dropped:
1. Check that the field is defined in the Joi schema
2. If you want all fields passed through, do not create a schema file (validation is optional)

### Validation error format

When validation fails, Joi errors are formatted as: `"Validation failed: field1 error, field2 error"` with HTTP status 400.

**Source reference:** `primate.js:validateSchema` (line ~649) loads the schema from `entities/{plural}/{singular}.schema.js`, checks for the `.validateAsync()` method, and calls it with `{ abortEarly: false, stripUnknown: true }`.

---

## 7. Service Not Loading

**Symptoms:** Custom service hooks (beforeCreate, afterCreate, etc.) are not being called.

### Check file path

The controller looks for the service file at:

```
entities/{plural}/{singular}.service.js
```

Where:
- `{plural}` is derived from the model name by converting camelCase to kebab-case, then pluralizing
- `{singular}` is the kebab-case form of the model name

Examples:
| Model Name | Service Path |
|------------|-------------|
| `user` | `entities/users/user.service.js` |
| `blogPost` | `entities/blog-posts/blog-post.service.js` |
| `orderItem` | `entities/order-items/order-item.service.js` |

### Export must be default

The service file must use a default export:

```javascript
// Correct
class ProductService { ... }
export default ProductService;

// WRONG - named export
export class ProductService { ... }

// WRONG - named export
export { ProductService };
```

The controller imports with `serviceModule.default`, so only `export default` works.

### Service method signatures

Custom service methods are called by the controller's `invokeServiceMethod`, which strips the entity name from the arguments. Make sure your service methods accept the right parameters:

```javascript
class ProductService {
    // Called as: service.create(data, options)
    // NOT: service.create('product', data, options)
    static async create(data, options = {}) { ... }

    // Called as: service.all(query, options)
    static async all(query, options = {}) { ... }

    // Called as: service.get(id, query, options)
    static async get(id, query = {}, options = {}) { ... }

    // Called as: service.update(id, data, options)
    static async update(id, data, options = {}) { ... }

    // Called as: service.delete(id, options)
    static async delete(id, options = {}) { ... }
}
```

If the custom service does not implement a method, the controller falls back to `PrimateService` (which uses the standard entity-name-based signature).

### Loading errors are silently caught

If the service file has a syntax error or import error, the controller catches the error and falls back to PrimateService. Check the console for warnings:

```
WARNING: Failed to load service "product": <error details>
```

If the error is `ERR_MODULE_NOT_FOUND` or `ENOENT`, no warning is logged (this is the normal case when no custom service exists).

**Source reference:** `controller.js:_loadDynamicService` (line ~86) builds the path as `./entities/${this.plural}/${this.singular}.service.js` and imports it dynamically. `controller.js:invokeServiceMethod` (line ~563) tries the custom service first, then falls back to PrimateService.

---

## 8. Common Diagnostic Commands

```bash
# Check Prisma can connect to the database
npx prisma db pull

# Regenerate Prisma client after schema changes
npx prisma generate

# Push schema changes to the database (development)
npx prisma db push

# Run database migrations (production)
npx prisma migrate dev

# Open Prisma Studio to inspect data
npx prisma studio

# Check entity folder structure
ls -la entities/*/

# Verify entity files match folder names
for dir in entities/*/; do
  folder=$(basename "$dir")
  if [ -f "$dir/$folder.js" ]; then
    echo "OK: $dir$folder.js"
  else
    echo "MISSING: $dir$folder.js"
  fi
done

# Check environment variables are set (without revealing values)
node -e "console.log('ACCESS_TOKEN_SECRET:', !!process.env.ACCESS_TOKEN_SECRET)"
node -e "console.log('DATABASE_URL:', !!process.env.DATABASE_URL)"
node -e "console.log('MASTER_TOKEN:', !!process.env.MASTER_TOKEN)"
node -e "console.log('PORT:', process.env.PORT || '(default)')"

# Test that the server starts
node index.js

# Test a health endpoint
curl http://localhost:3000/health

# Test an entity's CRUDAG status
curl http://localhost:3000/products/crudag

# Check what port is in use (Linux/Mac)
lsof -i :3000

# Check what port is in use (Windows)
netstat -ano | findstr :3000

# Test authentication with a token
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/products

# Inspect JWT token contents (without verification)
node -e "const [,payload] = 'YOUR_TOKEN'.split('.'); console.log(JSON.parse(Buffer.from(payload, 'base64url').toString()))"
```

### Quick Diagnostic Checklist

When something is not working, run through this checklist in order:

1. **Database connection:** `npx prisma db pull` -- if this fails, fix your `DATABASE_URL` first.
2. **Prisma client:** `npx prisma generate` -- always regenerate after schema changes.
3. **Server starts:** `node index.js` -- check for startup errors in the console.
4. **Entity loaded:** Look for `"Loaded entity: {name}"` in startup logs.
5. **Routes mounted:** Look for `"Mounted {name} routes at /{name}"` in startup logs.
6. **Auth working:** Test with `curl -H "Authorization: Bearer <token>" http://localhost:3000/{entity}`.
7. **Data valid:** Check request body matches the Joi schema (if one exists).
