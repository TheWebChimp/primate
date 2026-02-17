# Project Init Template

Boilerplate templates for scaffolding a new Primate project with `/primate init`.

## Directory Structure

```
project-root/
├── entities/          # Entity modules (auto-discovered)
├── routes/            # Custom routes
├── prisma/
│   └── schema.prisma  # Database schema
├── index.js           # Entry point
├── .env               # Environment variables
└── package.json
```

## index.js

```javascript
import Primate from '@thewebchimp/primate';

const primate = new Primate();

await primate.setup({
    entitiesDir: './entities',
    prismaClientLocation: '@prisma/client',
});

await primate.routes('./routes');

primate.start(process.env.PORT || 3000, (server, port) => {
    console.log(`Server running on port ${port}`);
});
```

## .env

```env
# Required
ACCESS_TOKEN_SECRET=change-this-to-a-secure-random-string-at-least-32-chars
DATABASE_URL=mysql://root:password@localhost:3306/myapp

# Server
PORT=3000
NODE_ENV=development

# Optional Authentication
# MASTER_TOKEN=change-this-to-a-secure-random-string-at-least-32-chars
# LOG_MASTER_TOKEN_USAGE=true

# Optional API Settings
# DEFAULT_PAGE_LIMIT=100
# MAX_PAGE_LIMIT=1000

# Optional JWT Settings
# JWT_EXPIRES_IN=24h
# JWT_ISSUER=my-api
```

## prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// Add your models below
```

## package.json

```json
{
  "name": "my-primate-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "db:push": "npx prisma db push",
    "db:generate": "npx prisma generate",
    "db:migrate": "npx prisma migrate dev",
    "db:studio": "npx prisma studio"
  },
  "dependencies": {
    "@thewebchimp/primate": "^1.2.5",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0"
  }
}
```

## Post-Init Steps

After scaffolding the project, run these commands in order:

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Configure environment variables** -- edit `.env` and set:
   - `DATABASE_URL` to your MySQL connection string
   - `ACCESS_TOKEN_SECRET` to a secure random string (at least 32 characters)

3. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

4. **Push schema to database:**
   ```bash
   npx prisma db push
   ```

5. **Start the server:**
   ```bash
   node index.js
   ```
   Or in watch mode for development:
   ```bash
   yarn dev
   ```
