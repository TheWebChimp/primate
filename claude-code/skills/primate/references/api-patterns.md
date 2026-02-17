# API Patterns

Complete reference for Primate API endpoints and query patterns.

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

```bash
# Exact match
GET /products?status=active

# Multiple values (IN)
GET /products?status=active,draft

# Range (numbers)
GET /products?price=10..50

# Range (dates)
GET /products?created=2024-01-01..2024-12-31
```

### Field Selection

```bash
# Select specific fields
GET /products?select=id,name,price

# Count only (no data)
GET /products?count=true
```

### Relation Includes

```bash
# Simple include
GET /posts?with=author

# Multiple includes
GET /posts?with=author,comments

# Nested includes
GET /posts?with=author.profile
GET /posts?with=comments.author

# Include with field selection
GET /posts?with=author(id,name)
GET /posts?with=author(id,name),comments(content)

# Nested with field selection
GET /posts?with=author.profile(bio,avatar)
GET /posts?with=comments.author(name,email)

# Complex nested includes
GET /posts?with=author.profile,comments.author.profile
```

### Legacy Fetch Parameters

```bash
# Include relation
GET /posts?fetch-author=1

# Include nested relation
GET /posts?fetch-comments=author
```

## Response Format

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
    { "id": 1, "name": "Widget A", ... },
    { "id": 2, "name": "Widget B", ... }
  ],
  "count": 150,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalPages": 8
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
import { auth } from '@thewebchimp/primate';

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
import { masterOnly } from '@thewebchimp/primate';

router.delete('/admin/purge', masterOnly, async (req, res) => {
  // Dangerous operation only for master token
  await prisma.log.deleteMany({
    where: { created: { lt: thirtyDaysAgo } }
  });
  res.respond({ message: 'Old logs purged' });
});
```

### Permission-Based Endpoint

```javascript
import { auth, hasPermission } from '@thewebchimp/primate';

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
