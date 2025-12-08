# Primate API Reference

Complete reference for Primate's auto-generated REST API endpoints and service methods.

## CRUDAG Endpoints

Every entity registered with `Primate.setupRoute()` gets these endpoints automatically:

### GET /entity
List all records with pagination, sorting, search, and filtering.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 100 | Records per page (max 1000) |
| `by` | string | 'id' | Field to sort by |
| `order` | string | 'desc' | Sort direction: 'asc' or 'desc' |
| `q` | string | - | Search term (searches queryableFields, aliases: filterFields, qFields) |
| `count` | boolean | false | Return only count, no data |
| `select` | string | - | Comma-separated fields to include |
| `with` | string | - | Relations to include (supports nesting and field selection) |
| `{field}` | any | - | Filter by exact field value |

**Example Requests:**
```bash
# Basic pagination
GET /users?page=2&limit=20

# Sort by creation date ascending
GET /posts?by=createdAt&order=asc

# Search users
GET /users?q=john

# Filter by status
GET /users?status=active

# Multiple filters
GET /posts?status=published&authorId=5

# Select specific fields
GET /users?select=id,name,email

# Count only
GET /users?count=true

# Include relations (simple)
GET /posts?with=author,category

# Include nested relations
GET /posts?with=author.profile,comments.user

# Include relations with field selection
GET /posts?with=author(id,name,email),comments(content,createdAt)

# Combined nested + field selection
GET /posts?with=author.profile(bio,avatar),comments.user(name)

# Deep nesting
GET /posts?with=comments.user.profile
```

**Response:**
```javascript
{
  "result": "success",
  "status": 200,
  "message": "Records retrieved successfully",
  "data": [
    { "id": 1, "name": "John", ... },
    { "id": 2, "name": "Jane", ... }
  ],
  "count": 150,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### POST /entity
Create a new record.

**Request Body:** JSON object with field values

**Example:**
```bash
POST /users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user"
}
```

**Response (201 Created):**
```javascript
{
  "result": "success",
  "status": 201,
  "message": "Record created successfully",
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2025-12-05T10:00:00.000Z"
  }
}
```

---

### GET /entity/:id
Get a single record by ID.

**Parameters:**
- `id` - Record ID (number) or UID (string)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `include` | string | Comma-separated relations to include |

**Example:**
```bash
GET /users/1
GET /users/1?include=posts,comments
GET /posts/abc123-uid
```

**Response:**
```javascript
{
  "result": "success",
  "status": 200,
  "message": "Record retrieved successfully",
  "data": {
    "id": 1,
    "name": "John Doe",
    "posts": [...]  // if included
  }
}
```

---

### PUT /entity/:id
Update an existing record.

**Request Body:** JSON object with fields to update (partial update supported)

**Example:**
```bash
PUT /users/1
Content-Type: application/json

{
  "name": "John Smith",
  "status": "inactive"
}
```

**Response:**
```javascript
{
  "result": "success",
  "status": 200,
  "message": "Record updated successfully",
  "data": {
    "id": 1,
    "name": "John Smith",
    "status": "inactive",
    "updatedAt": "2025-12-05T11:00:00.000Z"
  }
}
```

---

### DELETE /entity/:id
Delete a record.

**Example:**
```bash
DELETE /users/1
```

**Response:**
```javascript
{
  "result": "success",
  "status": 200,
  "message": "Record deleted successfully"
}
```

---

### PUT /entity/:id/metas
Update JSON metadata fields. Merges with existing data.

**Request Body:** JSON object with metadata to merge

**Example:**
```bash
PUT /users/1/metas
Content-Type: application/json

{
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

**Response:**
```javascript
{
  "result": "success",
  "status": 200,
  "message": "Metas updated successfully",
  "data": {
    "id": 1,
    "metas": {
      "preferences": {
        "theme": "dark",
        "notifications": true
      }
    }
  }
}
```

---

## Response Format

### Success Response
```javascript
{
  "result": "success",
  "status": 200,              // HTTP status code
  "message": "Description",   // Human-readable message
  "data": { ... },            // Single record or array
  "count": 100,               // Total count (list operations)
  "meta": {                   // Pagination metadata
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "responseTime": "45ms",     // Response time
  "timestamp": "2025-12-05T10:00:00.000Z",
  "requestId": "abc123"       // Request tracking ID
}
```

### Error Response
```javascript
{
  "result": "error",
  "status": 400,              // HTTP status code
  "message": "Error description",
  "errors": [                 // Validation errors (if applicable)
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2025-12-05T10:00:00.000Z",
  "requestId": "abc123"
}
```

### Common Error Codes

| Status | Message | Cause |
|--------|---------|-------|
| 400 | Bad Request | Invalid input, validation failed |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Record doesn't exist |
| 409 | Conflict | Unique constraint violation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## Service Methods

Use `PrimateService` for programmatic database operations:

```javascript
import { PrimateService } from '@thewebchimp/primate';
```

### create(model, data, options?)
Create a new record.

```javascript
const user = await PrimateService.create('user', {
  name: 'John Doe',
  email: 'john@example.com'
}, {
  include: { posts: true }  // Include relations in response
});
```

**Options:**
- `include` - Relations to include in response
- `select` - Fields to select
- `user` - User context for hooks

---

### update(model, id, data, options?)
Update an existing record.

```javascript
const user = await PrimateService.update('user', 1, {
  name: 'Jane Doe',
  // Relation updates:
  posts: {
    connect: [{ id: 5 }],     // Connect existing
    disconnect: [{ id: 2 }],  // Disconnect
    create: [{ title: 'New' }] // Create new
  }
});
```

---

### delete(model, id)
Delete a record.

```javascript
await PrimateService.delete('user', 1);
```

---

### get(model, id, query?, options?)
Get a single record.

```javascript
const user = await PrimateService.get('user', 1, {
  include: 'posts,comments'
});
```

---

### all(model, query?, options?)
Get multiple records.

```javascript
const users = await PrimateService.all('user', {
  page: 1,
  limit: 20,
  by: 'createdAt',
  order: 'desc',
  q: 'john',
  status: 'active'
}, {
  include: { profile: true }
});
```

---

### findById(model, id, options?)
Find by ID or UID.

```javascript
const user = await PrimateService.findById('user', 1);
const post = await PrimateService.findById('post', 'abc-123-uid');
```

---

### findBy(model, where, options?)
Find by custom criteria.

```javascript
const user = await PrimateService.findBy('user', {
  email: 'john@example.com'
});

const users = await PrimateService.findBy('user', {
  role: 'admin',
  status: 'active'
}, {
  many: true,  // Return array
  include: { department: true }
});
```

---

### updateMetas(model, id, metas)
Update JSON metadata field.

```javascript
await PrimateService.updateMetas('user', 1, {
  theme: 'dark',
  language: 'en'
});
```

---

### sanitizeData(model, data)
Remove invalid fields from data object.

```javascript
const cleanData = PrimateService.sanitizeData('user', {
  name: 'John',
  invalidField: 'removed',
  _internal: 'removed'
});
// Returns: { name: 'John' }
```

---

## Relation Handling

### One-to-Many Relations
```javascript
// Create with nested records
await PrimateService.create('post', {
  title: 'My Post',
  comments: {
    create: [
      { content: 'Comment 1' },
      { content: 'Comment 2' }
    ]
  }
});

// Update with relation operations
await PrimateService.update('post', 1, {
  comments: {
    create: [{ content: 'New comment' }],
    delete: [{ id: 5 }]
  }
});
```

### Many-to-Many Relations
```javascript
// Connect existing records
await PrimateService.update('post', 1, {
  tags: {
    connect: [{ id: 1 }, { id: 2 }]
  }
});

// Disconnect records
await PrimateService.update('post', 1, {
  tags: {
    disconnect: [{ id: 1 }]
  }
});

// Set exact relations (replaces all)
await PrimateService.update('post', 1, {
  tags: {
    set: [{ id: 3 }, { id: 4 }]
  }
});
```

---

## Caching

Enable caching for read operations:

```javascript
// In .env
CACHE_ENABLED=true
CACHE_TTL=300  // seconds

// Programmatic cache control
await PrimateService.all('user', query, {
  cache: true,      // Enable caching
  cacheTTL: 600     // Custom TTL
});

// Clear cache
await PrimateService.clearCache('user');
```
