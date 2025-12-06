# Primate Authentication

Complete guide to Primate's authentication and authorization system.

## Overview

Primate provides:
- JWT-based authentication
- Master token for admin access
- Permission-based authorization
- Pre-built middleware
- Token utilities

## JWT Authentication

### Configuration

```env
# Required
ACCESS_TOKEN_SECRET=your-secret-key-minimum-32-characters

# Optional
JWT_EXPIRES_IN=24h        # Token lifetime
JWT_ISSUER=primate-api    # Token issuer
JWT_ALGORITHM=HS256       # Signing algorithm
```

### Creating Tokens

```javascript
import { jwt } from '@thewebchimp/primate';

// Sign an access token
const token = await jwt.signAccessToken({
  id: user.id,
  role: user.role,
  permissions: user.permissions
});

// Sign a recovery token (short-lived)
const recoveryToken = await jwt.signRecoverToken({
  id: user.id,
  email: user.email
}, 3600); // 1 hour
```

### Verifying Tokens

```javascript
import { jwt } from '@thewebchimp/primate';

try {
  const payload = await jwt.verifyAccessToken(token);
  console.log(payload.id, payload.role);
} catch (error) {
  // Token invalid or expired
}

try {
  const payload = await jwt.verifyRecoverToken(token);
  // Process recovery
} catch (error) {
  // Token invalid or expired
}
```

---

## Auth Middleware

### Basic Usage

```javascript
import { auth, masterOnly, hasPermission, isMasterToken } from '@thewebchimp/primate';

// Require any valid token (JWT or master)
router.get('/protected', auth, (req, res) => {
  res.respond({ data: req.user });
});

// Require master token only
router.delete('/admin/reset', masterOnly, (req, res) => {
  // Only master token can access
});
```

### User Object

After authentication, `req.user` is populated:

```javascript
// JWT authentication
req.user = {
  type: 'jwt',
  payload: {
    id: 1,
    role: 'admin',
    permissions: ['read', 'write', 'delete'],
    // ... other claims from token
    iat: 1699999999,  // Issued at
    exp: 1700086399   // Expires at
  }
};

// Master token authentication
req.user = {
  type: 'master',
  payload: {
    id: 0,
    role: 'master',
    permissions: ['*'],  // All permissions
    isMaster: true
  }
};
```

---

## Master Token

Master token provides admin bypass for all permissions.

### Configuration

```env
MASTER_TOKEN=your-master-token-minimum-32-characters
LOG_MASTER_TOKEN_USAGE=true  # Recommended for security
```

### Usage

```bash
# Use master token in Authorization header
curl -H "Authorization: Bearer YOUR_MASTER_TOKEN" https://api.example.com/admin/users
```

### Checking Master Token

```javascript
import { isMasterToken } from '@thewebchimp/primate';

router.get('/admin', auth, (req, res) => {
  if (isMasterToken(req)) {
    // User authenticated with master token
    console.log('Master access');
  }
});
```

---

## Permission System

### Checking Permissions

```javascript
import { auth, hasPermission } from '@thewebchimp/primate';

router.post('/articles', auth, (req, res) => {
  if (!hasPermission(req, 'articles:create')) {
    return res.respond({ status: 403, message: 'Forbidden' });
  }
  // Create article...
});

router.delete('/articles/:id', auth, (req, res) => {
  // Master token always has permission
  if (!hasPermission(req, 'articles:delete')) {
    return res.respond({ status: 403, message: 'Forbidden' });
  }
  // Delete article...
});
```

### Permission Patterns

```javascript
// Single permission
hasPermission(req, 'users:read')

// Wildcard (all permissions) - auto-granted to master token
hasPermission(req, '*')

// Common permission schemes:
// - 'resource:action' (e.g., 'users:create', 'posts:delete')
// - 'module.action' (e.g., 'admin.access', 'reports.export')
// - Simple strings (e.g., 'admin', 'moderator')
```

### Permission Middleware Factory

```javascript
// Create reusable permission middleware
const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req, permission)) {
    return res.respond({ status: 403, message: 'Forbidden' });
  }
  next();
};

// Usage
router.post('/users', auth, requirePermission('users:create'), createUser);
router.put('/users/:id', auth, requirePermission('users:update'), updateUser);
router.delete('/users/:id', auth, requirePermission('users:delete'), deleteUser);
```

---

## Route-Level Auth Configuration

### Disable Auth for Specific Routes

```javascript
// entities/posts/posts.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('post', router, {
  // Disable all auth
  disableAuth: true,

  // Or disable specific operations
  disableAllAuth: true,      // GET /posts (list)
  disableGetAuth: true,      // GET /posts/:id
  disableCreateAuth: false,  // POST /posts (keep auth)
  disableUpdateAuth: false,  // PUT /posts/:id (keep auth)
  disableDeleteAuth: false,  // DELETE /posts/:id (keep auth)
  disableMetasAuth: false    // PUT /posts/:id/metas (keep auth)
});

export { router };
```

### Custom Auth Middleware

```javascript
// entities/posts/posts.js
import { Primate, auth, hasPermission } from '@thewebchimp/primate';

const router = Primate.getRouter();

// Custom middleware for create
const canCreatePost = (req, res, next) => {
  auth(req, res, (err) => {
    if (err) return next(err);
    if (!hasPermission(req, 'posts:create')) {
      return res.respond({ status: 403, message: 'Cannot create posts' });
    }
    next();
  });
};

Primate.setupRoute('post', router, {
  disableCreateAuth: canCreatePost,  // Use custom middleware
  disableAllAuth: true,              // Public listing
  disableGetAuth: true               // Public reading
});

export { router };
```

---

## Login Implementation

### Complete Login Example

```javascript
// routes/auth.js
import { Router } from 'express';
import { PrimateService, jwt, auth } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.respond({
        status: 400,
        message: 'Email and password required'
      });
    }

    // Find user
    const user = await PrimateService.findBy('user', { email });

    if (!user) {
      return res.respond({
        status: 401,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.respond({
        status: 401,
        message: 'Invalid credentials'
      });
    }

    // Check if active
    if (user.status !== 'active') {
      return res.respond({
        status: 403,
        message: 'Account not active'
      });
    }

    // Generate token
    const token = await jwt.signAccessToken({
      id: user.id,
      role: user.role,
      permissions: user.permissions || []
    });

    // Remove sensitive data
    delete user.password;

    res.respond({
      data: { token, user },
      message: 'Login successful'
    });
  } catch (error) {
    res.respond({
      status: 500,
      message: error.message
    });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if exists
    const existing = await PrimateService.findBy('user', { email });
    if (existing) {
      return res.respond({
        status: 409,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await PrimateService.create('user', {
      email,
      password: hashedPassword,
      name,
      role: 'user',
      status: 'pending'
    });

    delete user.password;

    res.respond({
      status: 201,
      data: user,
      message: 'Registration successful'
    });
  } catch (error) {
    res.respond({
      status: 500,
      message: error.message
    });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await PrimateService.findById('user', req.user.payload.id);

    if (!user) {
      return res.respond({
        status: 404,
        message: 'User not found'
      });
    }

    delete user.password;

    res.respond({ data: user });
  } catch (error) {
    res.respond({
      status: 500,
      message: error.message
    });
  }
});

// Refresh token
router.post('/refresh', auth, async (req, res) => {
  try {
    const user = await PrimateService.findById('user', req.user.payload.id);

    if (!user || user.status !== 'active') {
      return res.respond({
        status: 401,
        message: 'Invalid user'
      });
    }

    const token = await jwt.signAccessToken({
      id: user.id,
      role: user.role,
      permissions: user.permissions || []
    });

    res.respond({
      data: { token },
      message: 'Token refreshed'
    });
  } catch (error) {
    res.respond({
      status: 500,
      message: error.message
    });
  }
});

export default router;
```

---

## Password Reset Flow

```javascript
// routes/auth.js (continued)

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await PrimateService.findBy('user', { email });

    if (!user) {
      // Don't reveal if user exists
      return res.respond({
        message: 'If email exists, reset link sent'
      });
    }

    // Generate reset token (expires in 1 hour)
    const resetToken = await jwt.signRecoverToken({
      id: user.id,
      email: user.email
    }, 3600);

    // Store token hash in database
    await PrimateService.update('user', user.id, {
      resetToken: resetToken
    });

    // Send email (implement your email service)
    await sendResetEmail(user.email, resetToken);

    res.respond({
      message: 'If email exists, reset link sent'
    });
  } catch (error) {
    res.respond({
      status: 500,
      message: error.message
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    // Verify token
    const payload = await jwt.verifyRecoverToken(token);

    // Find user
    const user = await PrimateService.findById('user', payload.id);

    if (!user || user.resetToken !== token) {
      return res.respond({
        status: 400,
        message: 'Invalid or expired token'
      });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(password, 12);
    await PrimateService.update('user', user.id, {
      password: hashedPassword,
      resetToken: null
    });

    res.respond({
      message: 'Password reset successful'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.respond({
        status: 400,
        message: 'Reset token expired'
      });
    }
    res.respond({
      status: 500,
      message: error.message
    });
  }
});
```

---

## Security Best Practices

1. **Secret Management**
   - Use strong secrets (32+ characters)
   - Never commit secrets to git
   - Use different secrets per environment

2. **Token Security**
   - Keep token lifetime reasonable (24h default)
   - Implement token refresh for long sessions
   - Consider token blacklisting for logout

3. **Master Token**
   - Only use in production when necessary
   - Enable logging (`LOG_MASTER_TOKEN_USAGE=true`)
   - Rotate periodically

4. **Password Security**
   - Use bcrypt with sufficient rounds (12+)
   - Enforce minimum password length
   - Implement rate limiting on login

5. **Error Messages**
   - Don't reveal user existence in login errors
   - Use generic "Invalid credentials" messages
