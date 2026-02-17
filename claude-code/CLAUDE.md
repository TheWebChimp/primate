# Primate Project

This project uses the **Primate framework** (`@thewebchimp/primate`), a full-stack REST API framework built on Express.js and Prisma. It auto-generates CRUDAG endpoints (Create, Read, Update, Delete, All, Get) from Prisma models.

## Project Structure

```
project-root/
├── entities/           # Entity modules (auto-discovered)
│   └── {plural}/       # Entity folder (e.g., users/, products/)
│       ├── {plural}.js           # Router file (required)
│       ├── {singular}.service.js # Custom service (optional)
│       └── {singular}.schema.js  # JOI validation (optional)
├── routes/             # Custom routes (optional)
├── prisma/
│   └── schema.prisma   # Database schema
├── .env                # Environment variables
└── index.js            # Entry point
```

## Naming Conventions

| Component | Convention | Example |
|-----------|------------|---------|
| Prisma Model | PascalCase singular | `User`, `BlogPost`, `OrderItem` |
| Entity Folder | lowercase plural | `users/`, `blog-posts/`, `order-items/` |
| Entity Router File | `{plural}.js` | `users.js`, `blog-posts.js` |
| Service File | `{singular}.service.js` | `user.service.js`, `blog-post.service.js` |
| Schema File | `{singular}.schema.js` | `user.schema.js`, `blog-post.schema.js` |
| setupRoute model name | lowercase singular | `'user'`, `'blogPost'`, `'orderItem'` |
| Database table (@@map) | lowercase singular | `user`, `blog_post`, `order_item` |

## Entity Router Pattern

```javascript
// entities/users/users.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('user', router, {
    // Fields to search when ID is not numeric (e.g., GET /users/john)
    searchField: ['username', 'email'],

    // Fields searchable via ?q= parameter
    queryableFields: ['username', 'email', 'nicename', 'status'],

    // Disable auth per endpoint (optional)
    // disableAuth: true,          // Disable all auth
    // disableCreateAuth: true,    // Public POST /
    // disableAllAuth: true,       // Public GET /
    // disableGetAuth: true,       // Public GET /:id
    // disableUpdateAuth: true,    // Public PUT /:id
    // disableDeleteAuth: true,    // Public DELETE /:id
    // disableMetasAuth: true,     // Public PUT /:id/metas
});

// Custom routes (optional)
router.get('/me', auth, async (req, res) => {
    // Custom endpoint logic
});

export { router };
```

## Prisma Model Pattern

```prisma
model User {
  // Required: Auto-increment primary key
  id        Int      @id @default(autoincrement())

  // Recommended: Unique identifier for external use
  uid       String   @unique @default(cuid())

  // Custom fields
  username  String   @unique
  email     String   @unique
  password  String
  status    String   @default("active")

  // Recommended: JSON metadata field for flexible data
  metas     Json?    @default("{}")

  // Required: Timestamps
  created   DateTime @default(now())
  modified  DateTime @default(now()) @updatedAt

  // Map to lowercase table name
  @@map("user")
}
```

### Standard Field Types
- `Int` - Integer (use for IDs, counts)
- `String` - Text (use @db.VarChar(255) for indexed fields)
- `Boolean` - True/false
- `DateTime` - Timestamps
- `Float` - Decimal numbers
- `Json` - JSON data (for metas field)

### Relation Patterns
```prisma
// One-to-many: Post belongs to User
model Post {
  id       Int    @id @default(autoincrement())
  idUser   Int    // Foreign key field
  user     User   @relation(fields: [idUser], references: [id])
  @@map("post")
}

// Many-to-many: Post has many Tags
model Post {
  id    Int    @id @default(autoincrement())
  tags  Tag[]  // Implicit many-to-many
  @@map("post")
}
```

## Custom Service Pattern

```javascript
// entities/users/user.service.js
import { PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

class UserService {
    // Hook: Before creating a record
    static async beforeCreate(data, options = {}) {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        return data;
    }

    // Hook: After creating a record
    static async afterCreate(record, options = {}) {
        delete record.password;
        return record;
    }

    // Hook: After getting a single record
    static async afterGet(record, options = {}) {
        if (record) delete record.password;
        return record;
    }

    // Hook: After getting all records
    static async afterAll(records, options = {}) {
        return records.map(r => {
            delete r.password;
            return r;
        });
    }

    // Override CRUD methods (optional)
    static async create(data, options = {}) {
        data = await this.beforeCreate(data, options);
        const record = await PrimateService.create('user', data, options);
        return this.afterCreate(record, options);
    }
}

export default UserService;
```

### Available Hooks
| Hook | When Called | Purpose |
|------|-------------|---------|
| `beforeCreate` | Before INSERT | Modify/validate data, hash passwords |
| `afterCreate` | After INSERT | Remove sensitive fields, send notifications |
| `beforeUpdate` | Before UPDATE | Validate changes, rehash password if changed |
| `afterUpdate` | After UPDATE | Log changes, trigger side effects |
| `beforeDelete` | Before DELETE | Check permissions, cascade cleanup |
| `afterDelete` | After DELETE | Cleanup related data, log deletion |
| `beforeAll` | Before SELECT many | Modify query |
| `afterAll` | After SELECT many | Filter/transform results |
| `beforeGet` | Before SELECT one | Modify query |
| `afterGet` | After SELECT one | Filter/transform result |

## JOI Schema Validation

```javascript
// entities/users/user.schema.js
import Joi from 'joi';

const userSchema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    status: Joi.string().valid('active', 'inactive', 'pending').default('active'),
    role: Joi.string().valid('user', 'admin', 'moderator').default('user'),
});

export default userSchema;
```

## Auto-Generated API Endpoints (CRUDAG)

Each entity automatically gets these endpoints:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/` | Yes | Create new record |
| `GET` | `/` | No* | Get all records (paginated) |
| `GET` | `/:id` | No* | Get single record by ID or searchField |
| `PUT` | `/:id` | Yes | Update record |
| `DELETE` | `/:id` | Yes | Delete record |
| `PUT` | `/:id/metas` | Yes | Update JSON metas field |
| `GET` | `/health` | No | Health check |

*Auth depends on `disableAllAuth`/`disableGetAuth` options

## Query Parameters

### Pagination & Sorting
```
GET /users?page=1&limit=20&by=created&order=desc
```
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 100, max: 1000)
- `by` - Sort field (default: 'id')
- `order` - Sort direction: 'asc' or 'desc' (default: 'desc')

### Search & Filter
```
GET /users?q=john&status=active&role=admin
```
- `q` - Search across queryableFields
- `{field}=value` - Exact match filter
- `{field}=a,b,c` - IN filter (comma-separated)
- `{field}=1..100` - Range filter (numbers/dates)
- `count=true` - Return count only, no data
- `select=id,name,email` - Select specific fields

### Relation Includes (with parameter)
```
GET /posts?with=user,comments
GET /posts?with=user.profile,comments.author
GET /posts?with=user(id,name),comments(content,created)
GET /posts?with=user.profile(bio),comments.author(name)
```
- Simple: `with=user,comments` - Include relations
- Nested: `with=user.profile` - Include nested relations
- Select: `with=user(id,name)` - Include with field selection
- Combined: `with=user.profile(bio)` - Nested with selection

### Legacy Fetch Parameters
```
GET /posts?fetch-user=1&fetch-comments=author
```

## Authentication

### JWT Token
```bash
curl -H "Authorization: Bearer <jwt_token>" http://localhost:3000/users
```

### Master Token (Admin bypass)
```bash
# Set MASTER_TOKEN in .env
curl -H "Authorization: Bearer <master_token>" http://localhost:3000/users
```

### In Custom Routes
```javascript
import { auth, masterOnly, hasPermission, isMasterToken } from '@thewebchimp/primate';

// Require any valid token (JWT or master)
router.get('/protected', auth, (req, res) => {
    // req.user.payload contains { id, role, permissions, isMaster }
    // req.user.type is 'jwt' or 'master'
});

// Require master token only
router.delete('/admin-only', masterOnly, (req, res) => {
    // Only master token accepted
});

// Check specific permission
router.post('/publish', auth, (req, res) => {
    if (!hasPermission(req, 'publish')) {
        return res.respond({ status: 403, message: 'Forbidden' });
    }
    // User has 'publish' permission or is master
});
```

## Response Format

All endpoints return standardized JSON:

```javascript
// Success
{
    "result": "success",
    "status": 200,
    "message": "User retrieved successfully",
    "data": { ... },
    "count": 150,           // For list endpoints
    "meta": { ... },        // Pagination info
    "timestamp": "2025-01-04T...",
    "requestId": "abc123"
}

// Error
{
    "result": "error",
    "status": 400,
    "message": "Validation failed",
    "errors": [ ... ],
    "timestamp": "2025-01-04T..."
}
```

### Using res.respond()
```javascript
// Success response
res.respond({
    data: user,
    message: 'User created'
});

// Error response
res.respond({
    status: 400,
    message: 'Invalid email format'
});
```

## Environment Variables

```env
# Required
ACCESS_TOKEN_SECRET=your-secret-key-minimum-32-characters

# Database
DATABASE_URL=mysql://user:password@localhost:3306/database

# Server
PORT=3000
NODE_ENV=development

# Optional Authentication
MASTER_TOKEN=your-master-token-32-chars-min
LOG_MASTER_TOKEN_USAGE=true

# Optional API Settings
DEFAULT_PAGE_LIMIT=100
MAX_PAGE_LIMIT=1000

# Optional Primate Settings
ENTITIES_DIR=./entities
PRISMA_CLIENT_LOCATION=@prisma/client
```

---

## Debugging Guide

### Entity Not Loading

**Symptoms:**
- 404 on entity endpoints
- "Entity not found" errors
- Routes not registered

**Check:**
1. Folder name is plural lowercase: `users/` not `user/` or `Users/`
2. File name matches folder: `users/users.js` not `users/user.js`
3. File exports `router`: `export { router };`
4. Entry point calls `primate.setup()` with correct `entitiesDir`

```javascript
// Correct structure
entities/
└── users/
    └── users.js  // exports { router }
```

### Model Not Found in PrimateService

**Error:** `Model "user" not found. Available models: ...`

**Check:**
1. Prisma model exists in `schema.prisma`
2. Model name is PascalCase: `User` not `user`
3. `setupRoute` uses lowercase: `Primate.setupRoute('user', router)`
4. Run `npx prisma generate` after schema changes

### Prisma Errors

| Code | Meaning | Solution |
|------|---------|----------|
| `P2002` | Unique constraint violation | Check unique fields (email, username) |
| `P2003` | Foreign key constraint failed | Related record doesn't exist |
| `P2025` | Record not found | Check ID exists before update/delete |

**Example error handling:**
```javascript
try {
    await PrimateService.create('user', data);
} catch (error) {
    if (error.code === 'P2002') {
        // Duplicate entry
        const field = error.meta?.target?.[0];
        console.error(`Duplicate ${field}`);
    }
}
```

### Authentication Errors

| Status | Message | Cause |
|--------|---------|-------|
| 401 | No authorization header | Missing `Authorization` header |
| 401 | Invalid authorization format | Not using `Bearer <token>` format |
| 401 | Token expired | JWT exceeded expiration |
| 401 | Invalid token | Malformed or tampered JWT |
| 403 | Forbidden | Valid token but insufficient permissions |

**Debug checklist:**
1. Header format: `Authorization: Bearer <token>`
2. Token not expired (check JWT_EXPIRES_IN setting)
3. ACCESS_TOKEN_SECRET matches between sign and verify
4. For master token: MASTER_TOKEN env var is set

### Relation Errors with `with` Parameter

**Error:** `Relation "user" not found on model "post"`

**Check:**
1. Relation defined in Prisma schema
2. Using camelCase: `?with=blogPost` not `?with=blog-post`
3. Relation is accessible (not filtered by select)

```prisma
// Ensure relation exists
model Post {
  idUser Int
  user   User @relation(fields: [idUser], references: [id])  // <- Required
}
```

### Validation Errors

**Symptoms:**
- 400 Bad Request on create/update
- "Validation failed" message

**Check:**
1. Schema file exists: `entities/users/user.schema.js`
2. Schema exports default: `export default userSchema;`
3. Required fields provided in request body
4. Field types match schema (string vs number)

```javascript
// Debug: Log what data is received
router.post('/', auth, async (req, res) => {
    console.log('Received data:', req.body);
    // ...
});
```

### Common Mistakes

1. **Wrong model name case:**
   ```javascript
   // Wrong
   Primate.setupRoute('User', router);
   // Correct
   Primate.setupRoute('user', router);
   ```

2. **Missing router export:**
   ```javascript
   // Wrong
   export default router;
   // Correct
   export { router };
   ```

3. **Forgetting Prisma generate:**
   ```bash
   # After changing schema.prisma
   npx prisma generate
   npx prisma db push  # or migrate
   ```

4. **Wrong import path:**
   ```javascript
   // Wrong (for user projects)
   import { Primate } from '../../../src/index.js';
   // Correct
   import { Primate } from '@thewebchimp/primate';
   ```

5. **Circular relation issues:**
   ```prisma
   // Add relation name when bidirectional
   model User {
     posts Post[] @relation("UserPosts")
   }
   model Post {
     user User @relation("UserPosts", fields: [idUser], references: [id])
   }
   ```

### Stack Trace Analysis

**Primate-specific files to look for:**
- `primate.js` - Core class, entity loading, route setup
- `service.js` - Database operations, hooks
- `controller.js` - Request handling, CRUD operations
- `auth.js` - Authentication middleware

**Common stack patterns:**
```
Error in PrimateService.create -> Check beforeCreate hook
Error in PrimateController.all -> Check queryableFields option
Error in auth middleware -> Check token and headers
```

### Environment Issues

**Missing required env vars:**
```bash
# Check these are set
echo $ACCESS_TOKEN_SECRET  # Required for JWT
echo $DATABASE_URL         # Required for Prisma
```

**Database connection:**
```bash
# Test Prisma connection
npx prisma db pull  # Should succeed if connected
```

**Port already in use:**
```bash
# Find process on port
lsof -i :3000
# Or use different port
PORT=3001 node index.js
```
