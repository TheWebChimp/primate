---
name: primate
description: Generate and scaffold Primate framework entities, services, and validation schemas. Use when creating new API resources, adding custom business logic, or setting up validation for a Primate project.
---

# Primate Framework Skill

This skill helps generate and scaffold code for projects using the Primate framework (`@thewebchimp/primate`).

## Commands

### `/primate entity <Name>`

Generate a new entity with router and Prisma model.

**Usage:** `/primate entity Product`

**What it creates:**
1. `entities/products/products.js` - Entity router
2. Prisma model in `prisma/schema.prisma`

**Steps:**
1. Ask user for entity fields (name, type, required, unique)
2. Create entity folder: `entities/{plural}/`
3. Create router file with `Primate.setupRoute()`
4. Add Prisma model to `schema.prisma`
5. Remind user to run `npx prisma db push` or `npx prisma migrate dev`

### `/primate service <entity-name>`

Generate a custom service file for an existing entity.

**Usage:** `/primate service user`

**What it creates:**
- `entities/users/user.service.js` - Custom service with hooks

**Default hooks included:**
- `beforeCreate` - Data transformation before insert
- `afterCreate` - Post-processing after insert
- `afterGet` - Filter sensitive data on retrieval
- `afterAll` - Filter sensitive data on list retrieval

### `/primate schema <entity-name>`

Generate a JOI validation schema for an existing entity.

**Usage:** `/primate schema product`

**What it creates:**
- `entities/products/product.schema.js` - JOI validation schema

---

## Entity Generation Guidelines

### Naming Conversion Rules

When generating a new entity, convert the name as follows:

| Input | Prisma Model | Folder | Router File | Service File | Schema File | setupRoute |
|-------|--------------|--------|-------------|--------------|-------------|------------|
| `Product` | `Product` | `products/` | `products.js` | `product.service.js` | `product.schema.js` | `'product'` |
| `BlogPost` | `BlogPost` | `blog-posts/` | `blog-posts.js` | `blog-post.service.js` | `blog-post.schema.js` | `'blogPost'` |
| `OrderItem` | `OrderItem` | `order-items/` | `order-items.js` | `order-item.service.js` | `order-item.schema.js` | `'orderItem'` |

### Router File Template

```javascript
// entities/{plural}/{plural}.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('{modelName}', router, {
    queryableFields: [{stringFields}],
});

export { router };
```

Replace:
- `{plural}` - Plural lowercase with hyphens (e.g., `blog-posts`)
- `{modelName}` - Lowercase camelCase (e.g., `blogPost`)
- `{stringFields}` - Array of String field names for search

### Prisma Model Template

```prisma
model {ModelName} {
  id       Int      @id @default(autoincrement())
  uid      String   @unique @default(cuid())

  // User-defined fields here

  metas    Json?    @default("{}")
  created  DateTime @default(now())
  modified DateTime @default(now()) @updatedAt

  @@map("{tableName}")
}
```

Replace:
- `{ModelName}` - PascalCase singular (e.g., `BlogPost`)
- `{tableName}` - Lowercase with underscores (e.g., `blog_post`)

### Field Type Mapping

| User says | Prisma type | JOI validation |
|-----------|-------------|----------------|
| string, text | `String` | `Joi.string()` |
| number, integer, int | `Int` | `Joi.number().integer()` |
| decimal, float, price | `Float` | `Joi.number()` |
| boolean, bool, flag | `Boolean` | `Joi.boolean()` |
| date, datetime, timestamp | `DateTime` | `Joi.date()` |
| json, object, metadata | `Json` | `Joi.object()` |

### Service File Template

```javascript
// entities/{plural}/{singular}.service.js
import { PrimateService } from '@thewebchimp/primate';

class {ModelName}Service {
    static async beforeCreate(data, options = {}) {
        // Transform data before creation
        return data;
    }

    static async afterCreate(record, options = {}) {
        // Post-process created record
        return record;
    }

    static async afterGet(record, options = {}) {
        // Filter data on single record retrieval
        return record;
    }

    static async afterAll(records, options = {}) {
        // Filter data on list retrieval
        return records;
    }

    static async create(data, options = {}) {
        data = await this.beforeCreate(data, options);
        const record = await PrimateService.create('{modelName}', data, options);
        return this.afterCreate(record, options);
    }
}

export default {ModelName}Service;
```

### Schema File Template

```javascript
// entities/{plural}/{singular}.schema.js
import Joi from 'joi';

const {modelName}Schema = Joi.object({
    // Add field validations here
});

export default {modelName}Schema;
```

---

## Post-Generation Reminders

After generating an entity, always remind the user:

1. **Run Prisma commands:**
   ```bash
   npx prisma generate     # Update Prisma client
   npx prisma db push      # Push schema to database (dev)
   # OR
   npx prisma migrate dev  # Create migration (production)
   ```

2. **Restart the server** to load new entity

3. **Test the endpoints:**
   ```bash
   # List all
   curl http://localhost:3000/{plural}

   # Create
   curl -X POST http://localhost:3000/{plural} \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"field": "value"}'
   ```

---

## Examples

### Example 1: Simple Entity

**User:** `/primate entity Product`

**Assistant creates:**

`entities/products/products.js`:
```javascript
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('product', router, {
    queryableFields: ['name', 'description', 'status'],
});

export { router };
```

`prisma/schema.prisma` (append):
```prisma
model Product {
  id          Int      @id @default(autoincrement())
  uid         String   @unique @default(cuid())
  name        String
  description String?  @db.Text
  price       Float
  status      String   @default("active")
  metas       Json?    @default("{}")
  created     DateTime @default(now())
  modified    DateTime @default(now()) @updatedAt

  @@map("product")
}
```

### Example 2: Entity with Relations

**User:** `/primate entity Comment` (for a blog with Posts and Users)

**Assistant asks:** "Should Comment belong to a User and/or Post?"

**After confirmation, creates with relations:**

```prisma
model Comment {
  id       Int      @id @default(autoincrement())
  uid      String   @unique @default(cuid())
  content  String   @db.Text
  idUser   Int
  idPost   Int
  user     User     @relation(fields: [idUser], references: [id])
  post     Post     @relation(fields: [idPost], references: [id])
  metas    Json?    @default("{}")
  created  DateTime @default(now())
  modified DateTime @default(now()) @updatedAt

  @@map("comment")
}
```

### Example 3: Service for Sensitive Data

**User:** `/primate service user`

**Assistant creates:**

```javascript
// entities/users/user.service.js
import { PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

class UserService {
    static sensitiveFields = ['password', 'resetToken'];

    static removeSensitiveFields(record) {
        if (!record) return record;
        const clean = { ...record };
        this.sensitiveFields.forEach(field => delete clean[field]);
        return clean;
    }

    static async beforeCreate(data, options = {}) {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        return data;
    }

    static async afterCreate(record, options = {}) {
        return this.removeSensitiveFields(record);
    }

    static async afterGet(record, options = {}) {
        return this.removeSensitiveFields(record);
    }

    static async afterAll(records, options = {}) {
        return records.map(r => this.removeSensitiveFields(r));
    }

    static async create(data, options = {}) {
        data = await this.beforeCreate(data, options);
        const record = await PrimateService.create('user', data, options);
        return this.afterCreate(record, options);
    }
}

export default UserService;
```

### Example 4: Validation Schema

**User:** `/primate schema product`

**Assistant creates:**

```javascript
// entities/products/product.schema.js
import Joi from 'joi';

const productSchema = Joi.object({
    name: Joi.string().min(2).max(255).required(),
    description: Joi.string().max(2000).allow(''),
    price: Joi.number().positive().precision(2).required(),
    status: Joi.string().valid('active', 'inactive', 'draft').default('active'),
    stock: Joi.number().integer().min(0).default(0),
});

export default productSchema;
```

---

## Error Handling

If entity generation fails, check:

1. **Entity folder already exists** - Ask if user wants to overwrite
2. **Prisma model already exists** - Warn and ask for confirmation
3. **Invalid model name** - Must be PascalCase, no special characters
4. **Missing prisma/schema.prisma** - Project may not be initialized

## References

See the following files for detailed patterns:
- `references/entity-templates.md` - Complete code templates
- `references/api-patterns.md` - API endpoint patterns
- `references/prisma-snippets.md` - Prisma schema patterns
