# Auth Patterns

Complete reference for Primate authentication, JWT tokens, login/register flows, and permission checks.

## JWT Overview

Primate uses the `jsonwebtoken` library for JWT authentication.

- Token payload is wrapped: `jwt.sign({ payload }, secret, options)` — the payload goes inside a `payload` key
- Verified token resolves to `{ payload: { ...claims } }` — access claims via `req.user.payload`
- User object on request: `req.user = { type: 'jwt'|'master', payload: { id, role, permissions } }`
- Source: `src/utils/jwt.js` and `src/middlewares/auth.js`

## JWT Configuration

Set these in `.env` (sourced from `src/utils/config.js`):

| Variable | Description | Default |
|----------|-------------|---------|
| `ACCESS_TOKEN_SECRET` | Signing secret (required, min 32 chars) | — |
| `JWT_EXPIRES_IN` | Token lifetime | `'24h'` |
| `JWT_ISSUER` | Issuer claim | `'primate-api'` |
| `JWT_ALGORITHM` | Signing algorithm | `'HS256'` |

## Login Endpoint Template

```javascript
import { Router } from 'express';
import { PrimateService, jwt } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

const router = Router();

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.respond({ status: 400, message: 'Email and password are required' });
        }

        const user = await PrimateService.findBy('user', { email });
        if (!user) {
            return res.respond({ status: 401, message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.respond({ status: 401, message: 'Invalid credentials' });
        }

        const token = await jwt.signAccessToken({
            id: user.id,
            role: user.role || 'user',
            permissions: JSON.parse(user.permissions || '[]'),
        });

        delete user.password;
        res.respond({ data: { token, user }, message: 'Login successful' });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});
```

## Register Endpoint Template

```javascript
router.post('/register', async (req, res) => {
    try {
        const { email, password, username } = req.body;
        if (!email || !password) {
            return res.respond({ status: 400, message: 'Email and password are required' });
        }

        const existing = await PrimateService.findBy('user', { email });
        if (existing) {
            return res.respond({ status: 409, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await PrimateService.create('user', {
            email,
            username: username || email.split('@')[0],
            password: hashedPassword,
            status: 'active',
        });

        const token = await jwt.signAccessToken({
            id: user.id,
            role: user.role || 'user',
            permissions: [],
        });

        delete user.password;
        res.respond({ status: 201, data: { token, user }, message: 'Registration successful' });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});
```

## Get Current User Template

```javascript
import auth from '@thewebchimp/primate';

router.get('/me', auth, async (req, res) => {
    try {
        const user = await PrimateService.findById('user', req.user.payload.id);
        if (!user) {
            return res.respond({ status: 404, message: 'User not found' });
        }
        delete user.password;
        res.respond({ data: user });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});

export default router;
```

## Auth Middleware Reference

| Middleware / Helper | Import | Purpose |
|---------------------|--------|---------|
| `auth` | `import { auth } from '@thewebchimp/primate'` | Requires any valid token (JWT or master) |
| `masterOnly` | `import { masterOnly } from '@thewebchimp/primate/src/middlewares/auth.js'` | Requires master token ONLY |
| `hasPermission(req, permName)` | `import { hasPermission } from '@thewebchimp/primate/src/middlewares/auth.js'` | Checks `req.user.payload.permissions` array; master always passes |
| `isMasterToken(req)` | `import { isMasterToken } from '@thewebchimp/primate/src/middlewares/auth.js'` | Returns boolean |

## Master Token Pattern

- Set `MASTER_TOKEN` in `.env` (min 32 chars)
- Use as Bearer token: `Authorization: Bearer <master_token>`
- Master user object:

```javascript
req.user = {
    type: 'master',
    payload: {
        id: 0,
        role: 'master',
        permissions: ['*'],
        isMaster: true,
    },
};
```

- Enable logging with `LOG_MASTER_TOKEN_USAGE=true` in `.env`

## Permission Check Pattern

```javascript
import { auth } from '@thewebchimp/primate';
import { hasPermission } from '@thewebchimp/primate/src/middlewares/auth.js';

router.post('/admin/action', auth, async (req, res) => {
    if (!hasPermission(req, 'admin:write')) {
        return res.respond({ status: 403, message: 'Insufficient permissions' });
    }
    // admin action...
});
```

## User Model Requirements

Minimum Prisma model for auth:

```prisma
model User {
  id          Int      @id @default(autoincrement())
  uid         String   @unique @default(cuid())
  email       String   @unique
  password    String
  username    String?  @unique
  role        String   @default("user")
  permissions Json?    @default("[]")
  status      String   @default("active")
  lastLogin   DateTime?
  metas       Json?    @default("{}")
  created     DateTime @default(now())
  modified    DateTime @default(now()) @updatedAt

  @@index([email])
  @@map("user")
}
```
