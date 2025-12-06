# Primate Configuration

Complete reference for all Primate configuration options and environment variables.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ACCESS_TOKEN_SECRET` | JWT signing secret (min 32 characters) |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 1337 | Server port (1000-65535) |
| `FALLBACK_PORTS` | 8008,10101 | Comma-separated fallback ports |
| `HOST` | 0.0.0.0 | Server host binding |
| `BODY_LIMIT` | 10mb | Request body size limit |
| `SERVER_TIMEOUT` | 30000 | Server timeout in ms (1000-300000) |
| `NODE_ENV` | development | Environment: development, production, test |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | Prisma connection string |
| `DB_CONNECTION_LIMIT` | 10 | Connection pool size (1-100) |
| `DB_QUERY_TIMEOUT` | 30000 | Query timeout in ms (1000-60000) |
| `DB_RETRY_ATTEMPTS` | 3 | Auto-retry failed queries (1-10) |
| `DB_ENABLE_LOGGING` | true (dev) | Log database queries |
| `DB_SSL` | true (prod) | Force SSL connections |

### JWT Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_TOKEN_SECRET` | - | **Required.** JWT signing secret |
| `JWT_EXPIRES_IN` | 24h | Token expiration (e.g., 1h, 7d) |
| `JWT_ISSUER` | primate-api | Token issuer claim |
| `JWT_ALGORITHM` | HS256 | Signing algorithm |

### Master Token

| Variable | Default | Description |
|----------|---------|-------------|
| `MASTER_TOKEN` | - | Optional admin bypass token |
| `LOG_MASTER_TOKEN_USAGE` | true (dev) | Log master token usage |

### API Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_PAGE_LIMIT` | 100 | Default pagination limit (1-1000) |
| `MAX_PAGE_LIMIT` | 1000 | Maximum pagination limit (1-10000) |
| `DEFAULT_SORT_BY` | id | Default sort field |
| `DEFAULT_SORT_ORDER` | desc | Default sort direction |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW` | 900000 | Rate limit window in ms (60000-3600000) |
| `RATE_LIMIT_MAX` | 100 | Max requests per window (1-10000) |

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | * | Comma-separated allowed origins |
| `CORS_METHODS` | GET,POST,PUT,DELETE,OPTIONS,PATCH | Allowed methods |
| `CORS_HEADERS` | Content-Type,Authorization,... | Allowed headers |
| `CORS_CREDENTIALS` | false | Allow credentials |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | debug (dev), info (prod) | Log level |
| `LOG_FORMAT` | simple (dev), json (prod) | Log format |
| `LOG_ENABLE_FILE` | false (dev), true (prod) | Write to files |
| `LOG_ENABLE_CONSOLE` | true | Write to console |
| `LOG_MAX_FILE_SIZE` | 20MB | Max log file size |
| `LOG_MAX_FILES` | 5 | Max log files to keep (1-50) |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURITY_ENABLE_HELMET` | true | Enable Helmet.js headers |
| `SECURITY_ENABLE_RATE_LIMIT` | true (prod) | Enable rate limiting |
| `SESSION_SECRET` | - | Session secret (required in prod) |
| `BCRYPT_ROUNDS` | 12 | Password hashing rounds (8-15) |
| `PASSWORD_MIN_LENGTH` | 8 | Minimum password length (6-50) |

### Primate-Specific

| Variable | Default | Description |
|----------|---------|-------------|
| `ENTITIES_DIR` | ./entities | Entity definitions directory |
| `ROUTES_DIR` | ./routes | Custom routes directory |
| `SUPPRESS_ENTITIES_NOT_FOUND` | false | Suppress entity warnings |
| `ENABLE_PRISMA` | true | Enable Prisma ORM |
| `PRISMA_CLIENT_LOCATION` | @prisma/client | Prisma client path |
| `ENABLE_SCHEMA_VALIDATION` | true (prod) | Enable JOI validation |
| `AUTO_GENERATE_ROUTES` | true | Auto-generate CRUD routes |

### Caching

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_ENABLED` | false | Enable response caching |
| `CACHE_PROVIDER` | memory | Cache provider: memory, redis |
| `CACHE_TTL` | 300 | Cache TTL in seconds (1-86400) |
| `REDIS_URL` | - | Redis connection string |

### File Uploads

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_MAX_FILE_SIZE` | 50MB | Maximum file size |
| `UPLOAD_ALLOWED_TYPES` | image/jpeg,image/png,... | Allowed MIME types |
| `UPLOAD_DIR` | ./uploads | Upload directory |
| `ENABLE_CLOUD_STORAGE` | false | Use cloud storage |

---

## Programmatic Configuration

Configure Primate when initializing:

```javascript
import Primate from '@thewebchimp/primate';

const primate = new Primate({
  // CORS configuration
  cors: {
    origin: ['http://localhost:3000', 'https://myapp.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 500                    // 500 requests per window
  },

  // Body parser limits
  bodyLimit: '50mb'
});
```

---

## Setup Configuration

Configure during setup:

```javascript
await primate.setup({
  // Entity discovery
  entitiesDir: './entities',
  suppressEntitiesNotFound: false,

  // Prisma configuration
  prismaClientLocation: '@prisma/client',
  enablePrisma: true,

  // Validation
  enableSchemaValidation: true
});
```

---

## Accessing Configuration

```javascript
import config from '@thewebchimp/primate/utils/config';

// Access any configuration section
console.log(config.server.port);
console.log(config.database.url);
console.log(config.jwt.secret);
console.log(config.env.isDevelopment);
```

### Configuration Object Structure

```javascript
{
  env: {
    NODE_ENV: 'development',
    isDevelopment: true,
    isProduction: false,
    isTesting: false
  },
  server: {
    port: 1337,
    fallbackPorts: [8008, 10101],
    host: '0.0.0.0',
    bodyLimit: '10mb',
    timeout: 30000
  },
  database: {
    url: 'mysql://...',
    connectionLimit: 10,
    queryTimeout: 30000,
    retryAttempts: 3,
    enableLogging: true,
    ssl: false
  },
  jwt: {
    secret: '...',
    expiresIn: '24h',
    issuer: 'primate-api',
    algorithm: 'HS256'
  },
  auth: {
    masterToken: '...',
    logMasterTokenUsage: true,
    masterTokenMinLength: 32
  },
  api: {
    pagination: {
      defaultLimit: 100,
      maxLimit: 1000,
      defaultPage: 1,
      defaultSortBy: 'id',
      defaultSortOrder: 'desc'
    },
    rateLimit: {
      windowMs: 900000,
      max: 100
    },
    cors: {
      origin: ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [...],
      credentials: false
    }
  },
  logging: {
    level: 'debug',
    format: 'simple',
    enableFile: false,
    enableConsole: true,
    maxFileSize: '20MB',
    maxFiles: 5
  },
  security: {
    enableHelmet: true,
    enableRateLimit: false,
    bcryptRounds: 12,
    passwordMinLength: 8
  },
  primate: {
    entitiesDir: './entities',
    routesDir: './routes',
    suppressEntitiesNotFound: false,
    enablePrisma: true,
    prismaClientLocation: '@prisma/client',
    enableSchemaValidation: false,
    autoGenerateRoutes: true
  },
  cache: {
    enabled: false,
    provider: 'memory',
    ttl: 300
  },
  upload: {
    maxFileSize: '50MB',
    allowedTypes: [...],
    uploadDir: './uploads',
    enableCloudStorage: false
  }
}
```

---

## Example .env File

```env
# ===================
# REQUIRED
# ===================
ACCESS_TOKEN_SECRET=your-super-secret-key-at-least-32-chars

# ===================
# DATABASE
# ===================
DATABASE_URL=mysql://user:password@localhost:3306/mydb
DB_CONNECTION_LIMIT=10
DB_QUERY_TIMEOUT=30000
DB_ENABLE_LOGGING=true

# ===================
# SERVER
# ===================
PORT=3000
NODE_ENV=development
HOST=0.0.0.0
BODY_LIMIT=10mb
SERVER_TIMEOUT=30000

# ===================
# JWT
# ===================
JWT_EXPIRES_IN=24h
JWT_ISSUER=my-app

# ===================
# MASTER TOKEN (Optional)
# ===================
MASTER_TOKEN=your-master-token-at-least-32-chars
LOG_MASTER_TOKEN_USAGE=true

# ===================
# API
# ===================
DEFAULT_PAGE_LIMIT=50
MAX_PAGE_LIMIT=500
DEFAULT_SORT_BY=createdAt
DEFAULT_SORT_ORDER=desc

# ===================
# RATE LIMITING
# ===================
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=1000

# ===================
# CORS
# ===================
CORS_ORIGIN=http://localhost:3000,https://myapp.com
CORS_CREDENTIALS=true

# ===================
# LOGGING
# ===================
LOG_LEVEL=debug
LOG_FORMAT=simple
LOG_ENABLE_FILE=false

# ===================
# PRIMATE
# ===================
ENTITIES_DIR=./entities
ROUTES_DIR=./routes
PRISMA_CLIENT_LOCATION=@prisma/client

# ===================
# CACHE (Optional)
# ===================
CACHE_ENABLED=false
CACHE_PROVIDER=memory
CACHE_TTL=300
# REDIS_URL=redis://localhost:6379

# ===================
# UPLOADS (Optional)
# ===================
UPLOAD_MAX_FILE_SIZE=50MB
UPLOAD_DIR=./uploads
```

---

## Production Checklist

Required for production (`NODE_ENV=production`):

- [ ] `ACCESS_TOKEN_SECRET` - Strong secret (32+ chars)
- [ ] `SESSION_SECRET` - Strong session secret
- [ ] `DATABASE_URL` - Production database with SSL
- [ ] `DB_SSL=true` - Force SSL for database
- [ ] `SECURITY_ENABLE_RATE_LIMIT=true` - Enable rate limiting
- [ ] `LOG_LEVEL=info` or `warn` - Reduce log verbosity
- [ ] `LOG_FORMAT=json` - JSON logs for aggregation
- [ ] `ENABLE_SCHEMA_VALIDATION=true` - Validate all input

Optional but recommended:
- [ ] `MASTER_TOKEN` - Only if needed, with logging enabled
- [ ] `CORS_ORIGIN` - Specific origins, not `*`
- [ ] `CACHE_ENABLED=true` - Enable caching for performance
