# Primate Entities Guide

Entities are the core building blocks of a Primate application. Each entity represents a Prisma model with auto-generated REST endpoints.

## Entity Structure

Entities are auto-discovered from the entities directory:

```
entities/
├── users/
│   ├── users.js          # Router (required)
│   ├── users.service.js  # Custom service (optional)
│   └── users.schema.js   # JOI validation (optional)
├── posts/
│   ├── posts.js
│   └── posts.service.js
└── comments/
    └── comments.js
```

### Naming Conventions
- Directory name: plural, lowercase (e.g., `users`, `posts`)
- Router file: same as directory (e.g., `users.js`)
- Service file: `{entity}.service.js`
- Schema file: `{entity}.schema.js`
- Prisma model: singular, PascalCase (e.g., `User`, `Post`)

---

## Router File (Required)

The router file defines the entity's endpoints and configuration.

### Basic Router
```javascript
// entities/users/users.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

// Setup CRUDAG routes for 'user' model
Primate.setupRoute('user', router);

export { router };
```

### Router with Options
```javascript
// entities/users/users.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('user', router, {
  // Search configuration
  searchField: ['username', 'email', 'name'],  // Fields for single lookup (alias: singleField)
  queryableFields: ['status', 'role', 'type'], // Fields for ?q= search (aliases: filterFields, qFields)

  // Authentication options
  disableAuth: false,           // Disable all auth (default: false)
  disableCreateAuth: false,     // Public create endpoint
  disableAllAuth: false,        // Public list endpoint
  disableGetAuth: false,        // Public get endpoint
  disableUpdateAuth: false,     // Public update endpoint
  disableDeleteAuth: false,     // Public delete endpoint
  disableMetasAuth: false,      // Public metas endpoint

  // Custom middleware
  // disableCreateAuth: customMiddleware,  // Use custom auth for create
});

export { router };
```

### Router with Custom Endpoints
```javascript
// entities/users/users.js
import { Primate, PrimateService, auth } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('user', router, {
  searchField: ['username', 'email'],  // alias: singleField
  queryableFields: ['status', 'role']  // aliases: filterFields, qFields
});

// Custom endpoint: Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await PrimateService.findById('user', req.user.payload.id);
    if (!user) {
      return res.respond({ status: 404, message: 'User not found' });
    }
    res.respond({ data: user });
  } catch (error) {
    res.respond({ status: 500, message: error.message });
  }
});

// Custom endpoint: Change password
router.post('/:id/change-password', auth, async (req, res) => {
  const { id } = req.params;
  const { oldPassword, newPassword } = req.body;

  // Verify user can only change their own password
  if (req.user.payload.id !== parseInt(id)) {
    return res.respond({ status: 403, message: 'Forbidden' });
  }

  // ... password change logic
  res.respond({ message: 'Password changed successfully' });
});

// Custom endpoint: Bulk update
router.post('/bulk-update', auth, async (req, res) => {
  const { ids, data } = req.body;

  const results = await Promise.all(
    ids.map(id => PrimateService.update('user', id, data))
  );

  res.respond({ data: results, count: results.length });
});

export { router };
```

---

## Custom Service (Optional)

Custom services extend or override default behavior.

### Basic Custom Service
```javascript
// entities/users/users.service.js
import { PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

export default {
  // Lifecycle hooks
  hooks: {
    // Before creating a user
    async beforeCreate(data, options) {
      // Hash password
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
      }

      // Set defaults
      data.status = data.status || 'pending';
      data.createdAt = new Date();

      return data;
    },

    // After creating a user
    async afterCreate(record, options) {
      // Remove sensitive data from response
      delete record.password;

      // Send welcome email (async, don't await)
      sendWelcomeEmail(record.email);

      return record;
    },

    // Before updating
    async beforeUpdate(data, options) {
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
      }
      data.updatedAt = new Date();
      return data;
    },

    // After fetching single record
    async afterGet(record, options) {
      delete record.password;
      return record;
    },

    // After fetching list
    async afterAll(records, options) {
      return records.map(record => {
        delete record.password;
        return record;
      });
    }
  }
};
```

### Advanced Custom Service
```javascript
// entities/posts/posts.service.js
import { PrimateService } from '@thewebchimp/primate';

export default {
  hooks: {
    async beforeCreate(data, options) {
      // Generate slug from title
      data.slug = generateSlug(data.title);

      // Set author from authenticated user
      if (options.user) {
        data.authorId = options.user.id;
      }

      return data;
    },

    async beforeAll(query, options) {
      // Only show published posts to non-admins
      if (!options.user || options.user.role !== 'admin') {
        query.status = 'published';
      }
      return query;
    },

    async afterGet(record, options) {
      // Increment view count (async)
      PrimateService.update('post', record.id, {
        viewCount: (record.viewCount || 0) + 1
      });

      return record;
    },

    async beforeDelete(id, options) {
      // Check ownership
      const post = await PrimateService.findById('post', id);
      if (post.authorId !== options.user?.id && options.user?.role !== 'admin') {
        throw new Error('Not authorized to delete this post');
      }
      return id;
    }
  },

  // Custom methods (accessible via service)
  async publish(id) {
    return PrimateService.update('post', id, {
      status: 'published',
      publishedAt: new Date()
    });
  },

  async unpublish(id) {
    return PrimateService.update('post', id, {
      status: 'draft',
      publishedAt: null
    });
  }
};
```

---

## Available Hooks

| Hook | Parameters | Description |
|------|------------|-------------|
| `beforeCreate` | `(data, options)` | Modify data before insert |
| `afterCreate` | `(record, options)` | Process record after insert |
| `beforeUpdate` | `(data, options)` | Modify data before update |
| `afterUpdate` | `(record, options)` | Process record after update |
| `beforeDelete` | `(id, options)` | Validate before delete |
| `afterDelete` | `(result, options)` | Cleanup after delete |
| `beforeAll` | `(query, options)` | Modify query before fetch |
| `afterAll` | `(records, options)` | Process list after fetch |
| `beforeGet` | `(id, options)` | Validate before single fetch |
| `afterGet` | `(record, options)` | Process record after fetch |

### Hook Options Object
```javascript
{
  user: { id, role, permissions },  // Authenticated user
  req: Request,                      // Express request (if available)
  include: { ... },                  // Prisma include
  select: { ... },                   // Prisma select
  // ... other Prisma options
}
```

---

## Schema Validation (Optional)

Use JOI schemas for input validation:

```javascript
// entities/users/users.schema.js
import Joi from 'joi';

export default {
  // Schema for create operation
  create: Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().max(100),
    role: Joi.string().valid('user', 'admin').default('user')
  }),

  // Schema for update operation
  update: Joi.object({
    username: Joi.string().min(3).max(30),
    email: Joi.string().email(),
    password: Joi.string().min(8),
    name: Joi.string().max(100),
    role: Joi.string().valid('user', 'admin'),
    status: Joi.string().valid('active', 'inactive', 'pending')
  })
};
```

### Schema Validation Response
```javascript
// On validation error (400 Bad Request)
{
  "result": "error",
  "status": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "\"email\" must be a valid email"
    },
    {
      "field": "password",
      "message": "\"password\" length must be at least 8 characters"
    }
  ]
}
```

---

## Data Filtering

Filter data at various stages:

```javascript
// entities/users/users.service.js
export default {
  // Filter data before create/update
  dataFilter: (data) => {
    // Remove fields that shouldn't be set by users
    delete data.isAdmin;
    delete data.verified;
    delete data.createdAt;
    return data;
  },

  // Filter data in response
  resultFilter: (record) => {
    // Remove sensitive fields from response
    delete record.password;
    delete record.resetToken;
    delete record.internalNotes;
    return record;
  },

  hooks: {
    // ... hooks
  }
};
```

---

## Working with Relations

### Include Relations in Router
```javascript
// entities/posts/posts.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('post', router, {
  // Default includes for all operations
  defaultInclude: {
    author: {
      select: { id: true, name: true, avatar: true }
    },
    tags: true,
    _count: {
      select: { comments: true }
    }
  }
});

export { router };
```

### Relation Operations in Hooks
```javascript
// entities/posts/posts.service.js
export default {
  hooks: {
    async afterCreate(record, options) {
      // Create related records
      if (options.tags) {
        await PrimateService.update('post', record.id, {
          tags: {
            connect: options.tags.map(id => ({ id }))
          }
        });
      }
      return record;
    }
  }
};
```

---

## Entity Discovery

Primate auto-discovers entities during setup:

```javascript
// app.js
await primate.setup({
  entitiesDir: './entities',  // Default location
  // Or suppress warnings if no entities
  suppressEntitiesNotFound: true
});
```

### Discovery Process
1. Scans `entitiesDir` for subdirectories
2. Loads `{entity}.js` router from each directory
3. Optionally loads `{entity}.service.js` for custom behavior
4. Optionally loads `{entity}.schema.js` for validation
5. Mounts router at `/{entity}` path

### Manual Entity Registration
```javascript
// For special cases, register entities manually
import { router as usersRouter } from './entities/users/users.js';

primate.app.use('/api/v1/users', usersRouter);
```
