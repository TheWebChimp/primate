# Primate

A Node.js framework that integrates Express.js and Prisma for rapid REST API development with auto-generated CRUD endpoints.

## Features

- **Auto-generated REST APIs** - CRUDAG endpoints from Prisma models
- **Built-in Authentication** - JWT and master token support
- **Input Validation** - JOI schema validation
- **Security** - Helmet, CORS, rate limiting included
- **Hooks System** - Lifecycle hooks for customization
- **Caching** - Optional in-memory caching

## Installation

```bash
npm install @thewebchimp/primate
```

## Quick Start

### 1. Create your app entry point

```javascript
// app.js
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

### 2. Create a Prisma schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Create an entity

```javascript
// entities/users/users.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('user', router, {
  searchField: ['email', 'name'],
  queryableFields: ['status'],
});

export { router };
```

### 4. Configure environment

```env
# .env
DATABASE_URL="mysql://user:pass@localhost:3306/mydb"
ACCESS_TOKEN_SECRET="your-secret-key-minimum-32-characters"
PORT=3000
```

### 5. Run migrations and start

```bash
npx prisma migrate dev
node app.js
```

You now have these endpoints:
- `GET /users` - List all users (paginated)
- `POST /users` - Create user
- `GET /users/:id` - Get single user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## API Endpoints

### Query Parameters

```
GET /users?page=1&limit=20&by=createdAt&order=desc&q=john&status=active
```

| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 100 | Records per page (max 1000) |
| `by` | id | Sort field |
| `order` | desc | Sort direction (asc/desc) |
| `q` | - | Search term |
| `{field}` | - | Filter by field value |

### Response Format

```javascript
{
  "result": "success",
  "status": 200,
  "message": "Records retrieved successfully",
  "data": [...],
  "count": 100,
  "meta": { "page": 1, "limit": 20 }
}
```

## Custom Services

Add hooks and custom logic:

```javascript
// entities/users/users.service.js
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

## Authentication

### Using Auth Middleware

```javascript
import { auth, hasPermission } from '@thewebchimp/primate';

router.get('/protected', auth, (req, res) => {
  // req.user contains the authenticated user
  res.respond({ data: req.user });
});

// Check permissions
if (hasPermission(req, 'users:delete')) {
  // User has permission
}
```

### Generating Tokens

```javascript
import { jwt } from '@thewebchimp/primate';

const token = await jwt.signAccessToken({
  id: user.id,
  role: user.role,
  permissions: ['users:read', 'users:write']
});
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACCESS_TOKEN_SECRET` | Yes | - | JWT signing secret (min 32 chars) |
| `DATABASE_URL` | Yes | - | Prisma connection string |
| `PORT` | No | 1337 | Server port |
| `MASTER_TOKEN` | No | - | Admin bypass token |
| `JWT_EXPIRES_IN` | No | 24h | Token expiration |
| `RATE_LIMIT_MAX` | No | 1000 | Requests per 15 min |
| `CORS_ORIGIN` | No | * | Allowed origins |

### Route Options

```javascript
Primate.setupRoute('user', router, {
  searchField: ['email', 'name'],    // Fields for ?q= search
  queryableFields: ['status'],       // Fields for filtering
  disableAuth: false,                // Disable all auth
  disableCreateAuth: false,          // Public create
  disableGetAuth: false,             // Public read
  include: { posts: true },          // Default relations
});
```

## Service Methods

```javascript
import { PrimateService } from '@thewebchimp/primate';

// CRUD operations
await PrimateService.create('user', { email: 'john@example.com' });
await PrimateService.update('user', 1, { name: 'John' });
await PrimateService.delete('user', 1);
await PrimateService.get('user', 1);
await PrimateService.all('user', { page: 1, limit: 10 });

// Find methods
await PrimateService.findById('user', 1);
await PrimateService.findBy('user', { email: 'john@example.com' });
```

## Project Structure

```
my-app/
├── entities/
│   └── users/
│       ├── users.js           # Router
│       ├── users.service.js   # Custom hooks (optional)
│       └── users.schema.js    # JOI validation (optional)
├── routes/
│   └── auth.js               # Custom routes
├── prisma/
│   └── schema.prisma
├── app.js
├── .env
└── package.json
```

## Testing

```bash
npm test
npm run test:coverage
```

## License

MIT
