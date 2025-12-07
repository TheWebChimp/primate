# Primate Framework Reference

Primate is a Node.js framework that integrates Express.js and Prisma to accelerate API development. It auto-generates REST endpoints from Prisma models with built-in authentication, validation, and caching.

## Quick Start

```javascript
import Primate from '@thewebchimp/primate';

const primate = new Primate();

await primate.setup({
  entitiesDir: './entities',
  prismaClientLocation: '@prisma/client'
});

await primate.routes('./routes');

primate.start(3000, (server, port) => {
  console.log(`Server running on port ${port}`);
});
```

## Core Concepts

### CRUDAG Routes
Every entity automatically gets these endpoints:
- `GET /entity` - List all (paginated, filterable)
- `POST /entity` - Create record
- `GET /entity/:id` - Get single record
- `PUT /entity/:id` - Update record
- `DELETE /entity/:id` - Delete record
- `PUT /entity/:id/metas` - Update JSON metadata fields

### Entities
Auto-discovered from directory structure:
```
entities/
├── users/
│   ├── users.js          # Router (required)
│   ├── users.service.js  # Custom service (optional)
│   └── users.schema.js   # JOI validation (optional)
└── posts/
    └── posts.js
```

### Entity Router Example
```javascript
// entities/users/users.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('user', router, {
  searchField: ['username', 'email'],  // alias: singleField
  queryableFields: ['status', 'role'], // aliases: filterFields, qFields
  // Auth options:
  // disableAuth: true,           // Disable all auth
  // disableCreateAuth: true,     // Public create
  // disableGetAuth: true,        // Public read
});

// Add custom endpoints
router.get('/me', auth, async (req, res) => {
  const user = await PrimateService.findById('user', req.user.payload.id);
  res.respond({ data: user });
});

export { router };
```

### Custom Service Example
```javascript
// entities/users/users.service.js
import { PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

export default {
  hooks: {
    async beforeCreate(data, options) {
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
      }
      return data;
    },
    async afterCreate(record, options) {
      delete record.password;
      return record;
    }
  }
};
```

## Query Parameters

### Pagination & Sorting
```
GET /users?page=1&limit=20&by=createdAt&order=desc
```

| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 100 | Records per page (max 1000) |
| `by` | id | Sort field |
| `order` | desc | Sort direction (asc/desc) |

### Search & Filter
```
GET /users?q=john&status=active&role=admin
```

| Param | Description |
|-------|-------------|
| `q` | Search across queryableFields (aliases: filterFields, qFields) |
| `count` | Return only count, no data |
| `select` | Comma-separated fields to include |
| `{field}` | Filter by exact field value |

## Response Format

```javascript
// Success
{
  result: 'success',
  status: 200,
  message: 'Records retrieved successfully',
  data: [...],
  count: 100,
  meta: { page: 1, limit: 20, totalPages: 5 },
  timestamp: '2025-12-05T...',
  requestId: 'abc123'
}

// Error
{
  result: 'error',
  status: 400,
  message: 'Validation error',
  errors: [...],
  timestamp: '2025-12-05T...'
}
```

## Authentication

### JWT Auth Middleware
```javascript
import { auth, masterOnly, hasPermission } from '@thewebchimp/primate';

// Require any valid token
router.get('/protected', auth, handler);

// Require master token only
router.delete('/admin', masterOnly, handler);

// Check permissions
router.post('/publish', auth, (req, res, next) => {
  if (!hasPermission(req, 'publish')) {
    return res.respond({ status: 403, message: 'Forbidden' });
  }
  next();
}, handler);
```

### Token Payload Structure
```javascript
req.user = {
  type: 'jwt',  // or 'master'
  payload: {
    id: 1,
    role: 'admin',
    permissions: ['read', 'write', 'publish'],
    // ... custom claims
  }
}
```

## Service Methods

```javascript
import { PrimateService } from '@thewebchimp/primate';

// CRUD operations
await PrimateService.create('user', { name: 'John' });
await PrimateService.update('user', 1, { name: 'Jane' });
await PrimateService.delete('user', 1);
await PrimateService.get('user', 1);
await PrimateService.all('user', { page: 1, limit: 10 });

// Find methods
await PrimateService.findById('user', 1);
await PrimateService.findBy('user', { email: 'john@example.com' });

// Update JSON metadata
await PrimateService.updateMetas('user', 1, { theme: 'dark' });
```

## Hooks

Available in custom services:

| Hook | When Called |
|------|-------------|
| `beforeCreate` | Before inserting record |
| `afterCreate` | After inserting record |
| `beforeUpdate` | Before updating record |
| `afterUpdate` | After updating record |
| `beforeDelete` | Before deleting record |
| `afterDelete` | After deleting record |
| `beforeAll` | Before fetching list |
| `afterAll` | After fetching list |
| `beforeGet` | Before fetching single |
| `afterGet` | After fetching single |

## Relations

### One-to-Many
```javascript
// In create/update data
await PrimateService.create('post', {
  title: 'Hello',
  comments: {
    create: [
      { content: 'First comment' },
      { content: 'Second comment' }
    ]
  }
});
```

### Many-to-Many
```javascript
// Connect existing records
await PrimateService.update('post', 1, {
  tags: {
    connect: [{ id: 1 }, { id: 2 }]
  }
});

// Set exact relations (replaces existing)
await PrimateService.update('post', 1, {
  tags: {
    set: [{ id: 3 }]
  }
});
```

## Custom Routes

```javascript
// routes/auth.js
import { Router } from 'express';
import { PrimateService, jwt } from '@thewebchimp/primate';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await PrimateService.findBy('user', { email });

  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.respond({ status: 401, message: 'Invalid credentials' });
  }

  const token = await jwt.signAccessToken({
    id: user.id,
    role: user.role,
    permissions: user.permissions
  });

  res.respond({ data: { token, user } });
});

export default router;
```

## Project Structure

```
my-primate-app/
├── entities/
│   ├── users/
│   │   ├── users.js
│   │   ├── users.service.js
│   │   └── users.schema.js
│   └── posts/
│       └── posts.js
├── routes/
│   ├── auth.js
│   └── webhooks.js
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── app.js
├── .env
└── package.json
```

## See Also

- [API Reference](./primate-api.md) - Complete endpoint documentation
- [Entities Guide](./primate-entities.md) - Entity system details
- [Configuration](./primate-config.md) - All environment variables
- [Authentication](./primate-auth.md) - Auth system details
