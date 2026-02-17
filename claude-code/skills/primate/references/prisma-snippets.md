# Prisma Snippets

Common Prisma schema patterns for Primate projects.

## Basic Model Template

```prisma
model {ModelName} {
  // Primary key (required)
  id       Int      @id @default(autoincrement())

  // Unique identifier for external use (recommended)
  uid      String   @unique @default(cuid())

  // Custom fields here...

  // Flexible metadata storage (recommended)
  metas    Json?    @default("{}")

  // Timestamps (required)
  created  DateTime @default(now())
  modified DateTime @default(now()) @updatedAt

  // Map to snake_case table name
  @@map("{table_name}")
}
```

> **IMPORTANT: Foreign Key Naming Convention**
>
> Primate's ORM detection in `primate.js:addOneToManyRelations` looks for foreign key fields named **`id{OtherModelPascalCase}`** — for example: `idUser`, `idPost`, `idCategory`.
>
> This is **NOT** `userId` or `user_id`. It **MUST** be `id{PascalCase}`.
>
> ```prisma
> // CORRECT — Primate will auto-detect these relations
> idUser     Int
> idPost     Int
> idCategory Int
>
> // WRONG — Primate will NOT detect these
> userId     Int   // ❌ camelCase suffix
> user_id    Int   // ❌ snake_case
> fk_user    Int   // ❌ prefix style
> ```
>
> This convention applies to all foreign keys, including junction tables (`idPost`, `idTag`) and self-referential relations (`idParent`).

## Field Types

### String Fields

```prisma
// Basic string
name        String

// Optional string
description String?

// String with default
status      String   @default("active")

// Unique string
email       String   @unique
username    String   @unique

// String with length constraint (MySQL)
slug        String   @unique @db.VarChar(255)
shortCode   String   @db.VarChar(50)

// Long text (MySQL)
content     String   @db.Text
body        String   @db.LongText
```

### Numeric Fields

```prisma
// Integer
quantity    Int      @default(0)
views       Int      @default(0)

// Positive integer constraint (application-level)
stock       Int      @default(0)

// Float/Decimal
price       Float
rating      Float    @default(0)

// Decimal with precision (MySQL)
amount      Decimal  @db.Decimal(10, 2)
```

### Boolean Fields

```prisma
isActive    Boolean  @default(true)
isPublished Boolean  @default(false)
isFeatured  Boolean  @default(false)
isDeleted   Boolean  @default(false)  // Soft delete
```

### DateTime Fields

```prisma
// Auto timestamps
created     DateTime @default(now())
modified    DateTime @default(now()) @updatedAt

// Optional dates
publishedAt DateTime?
deletedAt   DateTime?  // Soft delete
expiresAt   DateTime?

// Specific date (no time)
birthDate   DateTime @db.Date
```

### JSON Fields

```prisma
// Flexible metadata
metas       Json?    @default("{}")

// Structured settings
settings    Json?    @default("{}")

// Array-like data
tags        Json?    @default("[]")
permissions Json?    @default("[]")
```

### Enum Fields

```prisma
// Define enum
enum UserRole {
  USER
  ADMIN
  MODERATOR
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

// Use in model
model User {
  role      UserRole   @default(USER)
}

model Post {
  status    PostStatus @default(DRAFT)
}
```

## Relations

### One-to-Many (Belongs To)

```prisma
// Post belongs to User
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
  @@map("user")
}

model Post {
  id     Int  @id @default(autoincrement())
  idUser Int
  user   User @relation(fields: [idUser], references: [id])
  @@map("post")
}
```

### One-to-Many (Has Many)

```prisma
// User has many Posts
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
  @@map("user")
}

model Post {
  id     Int   @id @default(autoincrement())
  idUser Int
  user   User  @relation(fields: [idUser], references: [id])
  @@map("post")
}
```

### One-to-One

```prisma
model User {
  id      Int      @id @default(autoincrement())
  profile Profile?
  @@map("user")
}

model Profile {
  id     Int    @id @default(autoincrement())
  idUser Int    @unique
  user   User   @relation(fields: [idUser], references: [id])
  bio    String?
  @@map("profile")
}
```

### Many-to-Many (Implicit)

```prisma
// Prisma creates junction table automatically
model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
  @@map("post")
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
  @@map("tag")
}
```

### Many-to-Many (Explicit Junction)

```prisma
model Post {
  id       Int        @id @default(autoincrement())
  postTags PostTag[]
  @@map("post")
}

model Tag {
  id       Int        @id @default(autoincrement())
  name     String     @unique
  postTags PostTag[]
  @@map("tag")
}

model PostTag {
  idPost    Int
  idTag     Int
  post      Post     @relation(fields: [idPost], references: [id])
  tag       Tag      @relation(fields: [idTag], references: [id])
  createdAt DateTime @default(now())

  @@id([idPost, idTag])
  @@map("post_tag")
}
```

### Self-Referential (Tree Structure)

```prisma
model Category {
  id       Int        @id @default(autoincrement())
  name     String
  idParent Int?
  parent   Category?  @relation("CategoryTree", fields: [idParent], references: [id])
  children Category[] @relation("CategoryTree")
  @@map("category")
}
```

### Multiple Relations to Same Model

```prisma
model User {
  id            Int     @id @default(autoincrement())
  writtenPosts  Post[]  @relation("PostAuthor")
  editedPosts   Post[]  @relation("PostEditor")
  @@map("user")
}

model Post {
  id       Int   @id @default(autoincrement())
  idAuthor Int
  idEditor Int?
  author   User  @relation("PostAuthor", fields: [idAuthor], references: [id])
  editor   User? @relation("PostEditor", fields: [idEditor], references: [id])
  @@map("post")
}
```

## Indexes

```prisma
model Product {
  id       Int      @id @default(autoincrement())
  name     String
  slug     String   @unique
  status   String
  category String
  price    Float
  created  DateTime @default(now())

  // Single column index
  @@index([status])

  // Composite index
  @@index([category, status])

  // Index for sorting
  @@index([created])

  // Index for search
  @@index([name])

  @@map("product")
}
```

## Common Model Patterns

### User Model

```prisma
model User {
  id        Int      @id @default(autoincrement())
  uid       String   @unique @default(cuid())
  username  String   @unique
  email     String   @unique
  password  String
  firstName String?
  lastName  String?
  avatar    String?
  role      String   @default("user")
  status    String   @default("pending")
  lastLogin DateTime?
  metas     Json?    @default("{}")
  created   DateTime @default(now())
  modified  DateTime @default(now()) @updatedAt

  // Relations
  posts     Post[]
  comments  Comment[]

  @@index([email])
  @@index([username])
  @@index([status])
  @@map("user")
}
```

### Post/Article Model

```prisma
model Post {
  id          Int       @id @default(autoincrement())
  uid         String    @unique @default(cuid())
  title       String
  slug        String    @unique @db.VarChar(255)
  excerpt     String?   @db.Text
  content     String    @db.LongText
  featuredImg String?
  status      String    @default("draft")
  publishedAt DateTime?
  idUser      Int
  user        User      @relation(fields: [idUser], references: [id])
  comments    Comment[]
  tags        Tag[]
  metas       Json?     @default("{}")
  created     DateTime  @default(now())
  modified    DateTime  @default(now()) @updatedAt

  @@index([slug])
  @@index([status])
  @@index([idUser])
  @@index([publishedAt])
  @@map("post")
}
```

### Product Model (E-commerce)

```prisma
model Product {
  id             Int      @id @default(autoincrement())
  uid            String   @unique @default(cuid())
  name           String
  slug           String   @unique @db.VarChar(255)
  sku            String?  @unique
  description    String?  @db.Text
  price          Float
  compareAtPrice Float?
  cost           Float?
  stock          Int      @default(0)
  lowStockAlert  Int      @default(5)
  weight         Float?
  status         String   @default("draft")
  isFeatured     Boolean  @default(false)
  idCategory     Int?
  category       Category? @relation(fields: [idCategory], references: [id])
  images         Json?    @default("[]")
  metas          Json?    @default("{}")
  created        DateTime @default(now())
  modified       DateTime @default(now()) @updatedAt

  @@index([slug])
  @@index([sku])
  @@index([status])
  @@index([idCategory])
  @@map("product")
}
```

### Comment Model

```prisma
model Comment {
  id       Int       @id @default(autoincrement())
  uid      String    @unique @default(cuid())
  content  String    @db.Text
  status   String    @default("pending")
  idUser   Int
  idPost   Int
  idParent Int?
  user     User      @relation(fields: [idUser], references: [id])
  post     Post      @relation(fields: [idPost], references: [id])
  parent   Comment?  @relation("CommentReplies", fields: [idParent], references: [id])
  replies  Comment[] @relation("CommentReplies")
  metas    Json?     @default("{}")
  created  DateTime  @default(now())
  modified DateTime  @default(now()) @updatedAt

  @@index([idUser])
  @@index([idPost])
  @@index([status])
  @@map("comment")
}
```

### Order Model (E-commerce)

```prisma
model Order {
  id            Int         @id @default(autoincrement())
  uid           String      @unique @default(cuid())
  orderNumber   String      @unique
  idUser        Int
  user          User        @relation(fields: [idUser], references: [id])
  status        String      @default("pending")
  subtotal      Float
  tax           Float       @default(0)
  shipping      Float       @default(0)
  discount      Float       @default(0)
  total         Float
  currency      String      @default("USD")
  paymentMethod String?
  paymentStatus String      @default("pending")
  shippingAddr  Json?
  billingAddr   Json?
  notes         String?     @db.Text
  items         OrderItem[]
  metas         Json?       @default("{}")
  created       DateTime    @default(now())
  modified      DateTime    @default(now()) @updatedAt

  @@index([orderNumber])
  @@index([idUser])
  @@index([status])
  @@index([paymentStatus])
  @@map("order")
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  idOrder   Int
  idProduct Int
  order     Order   @relation(fields: [idOrder], references: [id])
  product   Product @relation(fields: [idProduct], references: [id])
  name      String
  sku       String?
  price     Float
  quantity  Int
  total     Float
  metas     Json?   @default("{}")

  @@index([idOrder])
  @@index([idProduct])
  @@map("order_item")
}
```

### Configuration/Setting Model

```prisma
model Setting {
  id       Int      @id @default(autoincrement())
  key      String   @unique
  value    String   @db.Text
  type     String   @default("string")
  group    String   @default("general")
  metas    Json?    @default("{}")
  created  DateTime @default(now())
  modified DateTime @default(now()) @updatedAt

  @@index([group])
  @@map("setting")
}
```

### File/Media Model

```prisma
model Media {
  id           Int      @id @default(autoincrement())
  uid          String   @unique @default(cuid())
  filename     String
  originalName String
  mimeType     String
  size         Int
  path         String
  url          String?
  idUser       Int?
  user         User?    @relation(fields: [idUser], references: [id])
  metas        Json?    @default("{}")
  created      DateTime @default(now())
  modified     DateTime @default(now()) @updatedAt

  @@index([idUser])
  @@index([mimeType])
  @@map("media")
}
```

## MySQL-Specific Annotations

```prisma
// String lengths
name      String  @db.VarChar(255)
content   String  @db.Text
body      String  @db.LongText

// Decimal precision
price     Decimal @db.Decimal(10, 2)
rate      Decimal @db.Decimal(5, 4)

// Date only (no time)
birthDate DateTime @db.Date

// Time only
startTime DateTime @db.Time

// Unsigned integer
views     Int     @db.UnsignedInt

// Tiny int (boolean alternative)
isActive  Int     @db.TinyInt
```

## Soft Delete Pattern

```prisma
model Post {
  id        Int       @id @default(autoincrement())
  title     String
  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  created   DateTime  @default(now())
  modified  DateTime  @default(now()) @updatedAt

  @@index([isDeleted])
  @@map("post")
}
```

Usage in service:
```javascript
// Soft delete a record
await PrimateService.update('post', id, {
  isDeleted: true,
  deletedAt: new Date()
});

// Query non-deleted
const posts = await PrimateService.all('post', query, {
  where: { isDeleted: false }
});
```

Automatic filtering via service hook — add this to your entity's service file so all queries exclude soft-deleted records by default:
```javascript
// In post.service.js — filter out soft-deleted records automatically
class PostService {
    static async beforeAll(data, options = {}) {
        options.where = { ...options.where, isDeleted: false };
        return data;
    }

    static async beforeGet(data, options = {}) {
        options.where = { ...options.where, isDeleted: false };
        return data;
    }
}

export default PostService;
```
