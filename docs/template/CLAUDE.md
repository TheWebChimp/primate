# Primate Project Reference

<!--
  INSTRUCTIONS FOR USERS:
  Copy this file to your project root as CLAUDE.md
  Customize the "Project-Specific" section below with your entities and routes
-->

This project uses **Primate** - a Node.js framework integrating Express.js and Prisma for rapid API development.

## Quick Reference

### Project Structure
```
├── entities/           # Entity definitions (auto-discovered)
│   └── {entity}/
│       ├── {entity}.js          # Router (required)
│       ├── {entity}.service.js  # Custom hooks (optional)
│       └── {entity}.schema.js   # JOI validation (optional)
├── routes/             # Custom routes
├── prisma/
│   └── schema.prisma   # Database models
├── app.js              # Entry point
└── .env                # Configuration
```

### Auto-Generated CRUDAG Endpoints
Every entity gets these endpoints automatically:
- `GET /{entity}` - List all (paginated, filterable)
- `POST /{entity}` - Create
- `GET /{entity}/:id` - Get single
- `PUT /{entity}/:id` - Update
- `DELETE /{entity}/:id` - Delete
- `PUT /{entity}/:id/metas` - Update JSON metadata

### Query Parameters
```
GET /users?page=1&limit=20&by=createdAt&order=desc&q=john&status=active
```
| Param | Default | Description |
|-------|---------|-------------|
| page | 1 | Page number |
| limit | 100 | Records per page (max 1000) |
| by | id | Sort field |
| order | desc | Sort direction |
| q | - | Search term |
| {field} | - | Filter by field |

---

## Entity Router Template

```javascript
// entities/{entity}/{entity}.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('{model}', router, {
  searchField: ['field1', 'field2'],      // Fields for ?q= search
  queryableFields: ['status', 'type'],    // Fields for filtering
  // disableAuth: true,                   // Make all endpoints public
  // disableCreateAuth: true,             // Public create only
  // disableGetAuth: true,                // Public read only
});

export { router };
```

## Custom Service Template

```javascript
// entities/{entity}/{entity}.service.js
import { PrimateService } from '@thewebchimp/primate';

export default {
  hooks: {
    async beforeCreate(data, options) {
      // Modify data before insert
      return data;
    },
    async afterCreate(record, options) {
      // Process after insert
      return record;
    },
    async beforeUpdate(data, options) {
      return data;
    },
    async afterUpdate(record, options) {
      return record;
    },
    async afterGet(record, options) {
      // Remove sensitive fields
      return record;
    },
    async afterAll(records, options) {
      return records;
    }
  }
};
```

## Authentication

```javascript
import { auth, masterOnly, hasPermission } from '@thewebchimp/primate';

// Require auth
router.get('/protected', auth, handler);

// Check permissions
if (!hasPermission(req, 'permission:name')) {
  return res.respond({ status: 403, message: 'Forbidden' });
}

// Access user info
req.user.payload.id
req.user.payload.role
req.user.payload.permissions
```

## Service Methods

```javascript
import { PrimateService } from '@thewebchimp/primate';

// CRUD
await PrimateService.create('model', data);
await PrimateService.update('model', id, data);
await PrimateService.delete('model', id);
await PrimateService.get('model', id);
await PrimateService.all('model', { page, limit, q, ...filters });

// Find
await PrimateService.findById('model', id);
await PrimateService.findBy('model', { field: value });
```

## Response Helper

```javascript
// Success
res.respond({ data: result, message: 'Success' });

// Error
res.respond({ status: 400, message: 'Error message' });

// Created
res.respond({ status: 201, data: newRecord });
```

## Relations

```javascript
// One-to-Many: Create with nested
await PrimateService.create('post', {
  title: 'Post',
  comments: { create: [{ content: 'Comment' }] }
});

// Many-to-Many: Connect/Set
await PrimateService.update('post', id, {
  tags: { connect: [{ id: 1 }] }  // Add
  tags: { set: [{ id: 1 }] }      // Replace all
});
```

---

## Project-Specific Information

<!-- CUSTOMIZE THIS SECTION FOR YOUR PROJECT -->

### Entities

<!-- List your entities and their key fields -->

### Custom Routes

<!-- List your custom routes at /routes -->

### Environment Variables

```env
# Required
ACCESS_TOKEN_SECRET=
DATABASE_URL=

# Optional
PORT=3000
JWT_EXPIRES_IN=24h
MASTER_TOKEN=
```

---

## Common Tasks

### Add New Entity
1. Create `entities/{name}/{name}.js` with router
2. Add model to `prisma/schema.prisma`
3. Run `npx prisma migrate dev`

### Add Custom Endpoint
```javascript
// In entity router or routes/{name}.js
router.get('/custom', auth, async (req, res) => {
  const result = await PrimateService.findBy('model', { ... });
  res.respond({ data: result });
});
```

### Hash Password
```javascript
import bcrypt from 'bcrypt';
data.password = await bcrypt.hash(data.password, 12);
```

### Generate JWT Token
```javascript
import { jwt } from '@thewebchimp/primate';
const token = await jwt.signAccessToken({ id, role, permissions });
```
