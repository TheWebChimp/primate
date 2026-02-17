# API Patterns

Complete reference for Primate API endpoints, query parameters, and response formats.

## Auto-Generated Endpoints (CRUDAG)

Every entity automatically gets these endpoints at `/{plural}`:

| Method | Endpoint | Auth Default | Description |
|--------|----------|--------------|-------------|
| `POST` | `/` | Required | Create new record |
| `GET` | `/` | Optional | List all records (paginated) |
| `GET` | `/:id` | Optional | Get single record |
| `PUT` | `/:id` | Required | Update record |
| `DELETE` | `/:id` | Required | Delete record |
| `PUT` | `/:id/metas` | Required | Update metas JSON field |
| `GET` | `/health` | None | Health check |
| `GET` | `/crudag` | None | CRUDAG status check |

## Request Examples

### Create Record
```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Widget",
    "price": 29.99,
    "status": "active"
  }'
```

### Get All Records
```bash
curl http://localhost:3000/products
```

### Get Single Record
```bash
# By ID
curl http://localhost:3000/products/1

# By UID
curl http://localhost:3000/products/clx1234567890

# By searchField (e.g., slug)
curl http://localhost:3000/products/my-widget-slug
```

### Update Record
```bash
curl -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "price": 24.99,
    "status": "inactive"
  }'
```

### Delete Record
```bash
curl -X DELETE http://localhost:3000/products/1 \
  -H "Authorization: Bearer <token>"
```

### Update Metas
```bash
curl -X PUT http://localhost:3000/products/1/metas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "seoTitle": "Best Widget Ever",
    "featured": true
  }'
```

## Query Parameters

### Pagination

```bash
# Basic pagination
GET /products?page=1&limit=20

# Custom sort
GET /products?page=1&limit=20&by=created&order=desc
GET /products?page=1&limit=20&by=price&order=asc
```

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `page` | 1 | - | Page number |
| `limit` | 100 | 1000 | Records per page |
| `by` | 'id' | - | Sort field |
| `order` | 'desc' | - | 'asc' or 'desc' |

### Search

```bash
# Search across queryableFields
GET /products?q=widget

# Combined with pagination
GET /products?q=widget&page=1&limit=10
```

### Field Filters

Field filters are built by `_buildFieldFilters` in service.js. Any query parameter that matches a model field name (and is not a reserved parameter like `page`, `limit`, `by`, `order`, `q`, `with`, `select`, `count`) is treated as a field filter.

#### Exact Match

```bash
GET /products?status=active
```

Prisma query: `{ where: { status: 'active' } }`

#### Comma-Separated (IN filter)

Values separated by commas produce a Prisma `in` clause:

```bash
GET /products?status=active,draft
```

Prisma query: `{ where: { status: { in: ['active', 'draft'] } } }`

#### Pipe-Separated (has filter)

Values separated by pipes produce a Prisma `has` clause (for array/JSON fields):

```bash
GET /products?tags=tech|science
```

Prisma query: `{ where: { tags: { has: ['tech', 'science'] } } }`

#### Range Filter (gte/lte)

Two values separated by `..` produce a range query with `gte` and `lte`:

```bash
# Numeric range
GET /products?price=10..50
```

Prisma query: `{ where: { price: { gte: 10, lte: 50 } } }`

```bash
# Date range
GET /products?created=2024-01-01..2024-12-31
```

Prisma query: `{ where: { created: { gte: '2024-01-01', lte: '2024-12-31' } } }`

#### Combined Filters

All filter types can be combined in a single request:

```bash
GET /products?status=active,draft&price=10..50&q=widget&page=1&limit=20
```

### Field Selection (select parameter)

Use `select` to return only specific fields. Fields are comma-separated:

```bash
GET /products?select=id,name,price
```

Prisma query: `{ select: { id: true, name: true, price: true } }`

This reduces response payload size when you only need certain columns.

### Count Parameter

Use `count=true` to get only the total count of matching records without returning actual data:

```bash
GET /products?count=true
GET /products?status=active&count=true
```

Response:
```json
{
  "result": "success",
  "status": 200,
  "message": "Products retrieved successfully",
  "data": [],
  "count": 150,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "abc123"
}
```

### Relation Includes (with parameter)

The `with` parameter includes related models in the response. It is parsed by `_parseWithParam` in service.js, which validates each entry against the regex `/^[\w.]+(\([\w,\s]+\))?$/` and converts names using `changeCase.camelCase`.

#### Pattern 1: Simple Include

Include one or more relations by name:

```bash
GET /posts?with=user
GET /posts?with=user,comments
```

Prisma query:
```javascript
{ include: { user: true, comments: true } }
```

#### Pattern 2: Nested Include

Use dot notation to include nested relations:

```bash
GET /posts?with=user.profile
GET /posts?with=comments.author
```

Prisma query:
```javascript
// with=user.profile
{
  include: {
    user: {
      include: {
        profile: true
      }
    }
  }
}
```

#### Pattern 3: Field Selection on Relations

Use parentheses to select specific fields from a relation:

```bash
GET /posts?with=user(id,name)
GET /posts?with=user(id,name),comments(content,created)
```

Prisma query:
```javascript
// with=user(id,name)
{
  include: {
    user: {
      select: {
        id: true,
        name: true
      }
    }
  }
}
```

#### Pattern 4: Nested Include with Field Selection

Combine dot notation with parentheses for nested relations with field selection:

```bash
GET /posts?with=user.profile(bio)
GET /posts?with=user.profile(bio,avatar)
GET /posts?with=comments.author(name,email)
```

Prisma query:
```javascript
// with=user.profile(bio)
{
  include: {
    user: {
      include: {
        profile: {
          select: {
            bio: true
          }
        }
      }
    }
  }
}
```

#### Complex Combined Examples

```bash
# Multiple relations with different patterns
GET /posts?with=user.profile,comments.author.profile

# Mixed simple and nested with field selection
GET /posts?with=user(id,name),comments.author(name,email)

# Deep nesting
GET /posts?with=comments.author.profile(bio,avatar)
```

### Legacy Fetch Parameters

```bash
# Include relation
GET /posts?fetch-author=1

# Include nested relation
GET /posts?fetch-comments=author
```

## Response Format

All endpoints return standardized JSON via `res.respond()`.

### Success Response (Single)

```json
{
  "result": "success",
  "status": 200,
  "message": "Product retrieved successfully",
  "data": {
    "id": 1,
    "uid": "clx1234567890",
    "name": "Widget",
    "price": 29.99,
    "status": "active",
    "metas": {},
    "created": "2024-01-01T00:00:00.000Z",
    "modified": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "abc123"
}
```

### Success Response (List)

```json
{
  "result": "success",
  "status": 200,
  "message": "Products retrieved successfully",
  "data": [
    { "id": 1, "name": "Widget A", "price": 29.99 },
    { "id": 2, "name": "Widget B", "price": 19.99 }
  ],
  "count": 150,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "responseTime": "45ms"
  },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "abc123"
}
```

### Error Response

```json
{
  "result": "error",
  "status": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "abc123"
}
```

### Response Fields Reference

| Field | Type | Present | Description |
|-------|------|---------|-------------|
| `result` | string | Always | `"success"` or `"error"` |
| `status` | number | Always | HTTP status code |
| `message` | string | Always | Human-readable description |
| `data` | object/array | Success | Record(s) returned |
| `count` | number | List endpoints | Total matching records |
| `meta` | object | List endpoints | Pagination metadata |
| `meta.page` | number | List endpoints | Current page number |
| `meta.limit` | number | List endpoints | Records per page |
| `meta.totalPages` | number | List endpoints | Total number of pages |
| `meta.responseTime` | string | List endpoints | Server processing time |
| `errors` | array | Error | Validation error details |
| `timestamp` | string | Always | ISO 8601 timestamp |
| `requestId` | string | Always | Unique request identifier for tracing |

### Common Error Codes

| Status | Meaning | Common Cause |
|--------|---------|--------------|
| 400 | Bad Request | Validation error, missing required field |
| 401 | Unauthorized | Missing/invalid/expired token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Record doesn't exist |
| 409 | Conflict | Duplicate unique field (email, username) |
| 500 | Server Error | Database error, unhandled exception |

## Authentication Patterns

### Bearer Token (JWT or Master)

```bash
# JWT token
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  http://localhost:3000/products

# Master token
curl -H "Authorization: Bearer your-master-token-here" \
  http://localhost:3000/products
```

### Token Payload Structure

```javascript
// JWT payload after verification
req.user = {
  type: 'jwt',
  payload: {
    id: 1,
    role: 'admin',
    permissions: ['read', 'write', 'delete'],
    // ... other custom claims
  }
}

// Master token payload
req.user = {
  type: 'master',
  payload: {
    id: 0,
    role: 'master',
    permissions: ['*'],
    isMaster: true
  }
}
```

## Custom Route Patterns

### Public Endpoint

```javascript
import { Primate, PrimateService } from '@thewebchimp/primate';

const router = Primate.getRouter();

router.get('/public/featured', async (req, res) => {
  const products = await PrimateService.all('product', {
    ...req.query,
    featured: true,
    status: 'active'
  });
  res.respond({ data: products.data, count: products.count });
});
```

### Protected Endpoint

```javascript
import { Primate, PrimateService, auth } from '@thewebchimp/primate';

const router = Primate.getRouter();

router.get('/my/orders', auth, async (req, res) => {
  const orders = await PrimateService.all('order', {
    ...req.query
  }, {
    where: { idUser: req.user.payload.id }
  });
  res.respond({ data: orders.data, count: orders.count });
});
```

### Master-Only Endpoint

```javascript
import { Primate } from '@thewebchimp/primate';
import { masterOnly } from '@thewebchimp/primate/src/middlewares/auth.js';

const router = Primate.getRouter();

router.delete('/admin/purge', masterOnly, async (req, res) => {
  // Dangerous operation only for master token
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.log.deleteMany({
    where: { created: { lt: thirtyDaysAgo } }
  });
  res.respond({ message: 'Old logs purged' });
});
```

### Permission-Based Endpoint

```javascript
import { Primate, PrimateService, auth } from '@thewebchimp/primate';
import { hasPermission } from '@thewebchimp/primate/src/middlewares/auth.js';

const router = Primate.getRouter();

router.post('/posts/:id/publish', auth, async (req, res) => {
  if (!hasPermission(req, 'publish')) {
    return res.respond({ status: 403, message: 'Publish permission required' });
  }

  const post = await PrimateService.update('post', req.params.id, {
    status: 'published',
    publishedAt: new Date()
  });
  res.respond({ data: post });
});
```

### Combined Master and Permission Check

```javascript
import { Primate, PrimateService, auth } from '@thewebchimp/primate';
import { masterOnly, hasPermission } from '@thewebchimp/primate/src/middlewares/auth.js';

const router = Primate.getRouter();

// Route that requires master token
router.post('/admin/reset-all', masterOnly, async (req, res) => {
  // Only master token can access
  res.respond({ message: 'Reset complete' });
});

// Route that checks a specific permission
router.put('/posts/:id/feature', auth, async (req, res) => {
  if (!hasPermission(req, 'feature_posts')) {
    return res.respond({ status: 403, message: 'Feature permission required' });
  }

  const post = await PrimateService.update('post', req.params.id, {
    featured: true
  });
  res.respond({ data: post });
});
```

## Bulk Operations

### Bulk Create

```javascript
router.post('/bulk', auth, async (req, res) => {
  const { items } = req.body;
  const created = await Promise.all(
    items.map(item => PrimateService.create('product', item))
  );
  res.respond({ data: created, count: created.length });
});
```

### Bulk Update

```javascript
router.put('/bulk/status', auth, async (req, res) => {
  const { ids, status } = req.body;
  const updated = await Promise.all(
    ids.map(id => PrimateService.update('product', id, { status }))
  );
  res.respond({ data: updated, count: updated.length });
});
```

### Bulk Delete

```javascript
router.delete('/bulk', auth, async (req, res) => {
  const { ids } = req.body;
  const deleted = await Promise.all(
    ids.map(id => PrimateService.delete('product', id))
  );
  res.respond({ message: `Deleted ${deleted.length} records` });
});
```
