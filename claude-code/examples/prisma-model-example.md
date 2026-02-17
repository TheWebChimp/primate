# Prisma Model Example

Add this model to your `prisma/schema.prisma` file:

```prisma
model Product {
  id             Int       @id @default(autoincrement())
  uid            String    @unique @default(cuid())

  // Basic info
  name           String
  slug           String    @unique @db.VarChar(255)
  sku            String?   @unique @db.VarChar(50)
  description    String?   @db.Text
  shortDescription String? @db.VarChar(500)

  // Pricing
  price          Float
  compareAtPrice Float?
  cost           Float?

  // Inventory
  stock          Int       @default(0)
  lowStockAlert  Int       @default(5)
  weight         Float?

  // Status
  status         String    @default("draft")
  isFeatured     Boolean   @default(false)

  // Relations (uncomment if you have these models)
  // idCategory     Int?
  // category       Category? @relation(fields: [idCategory], references: [id])
  // idBrand        Int?
  // brand          Brand?    @relation(fields: [idBrand], references: [id])

  // Flexible metadata (images, SEO, dimensions, etc.)
  metas          Json?     @default("{}")

  // Timestamps
  created        DateTime  @default(now())
  modified       DateTime  @default(now()) @updatedAt

  // Indexes for performance
  @@index([slug])
  @@index([sku])
  @@index([status])
  @@index([isFeatured])

  // Table name mapping
  @@map("product")
}
```

## After Adding the Model

Run these commands:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (development)
npx prisma db push

# OR create migration (production)
npx prisma migrate dev --name add_product_model
```

## Example Usage

```bash
# Create product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Awesome Widget",
    "price": 29.99,
    "description": "A really awesome widget",
    "stock": 100,
    "status": "active"
  }'

# Get all products
curl http://localhost:3000/products

# Get product by slug
curl http://localhost:3000/products/awesome-widget

# Search products
curl "http://localhost:3000/products?q=widget&status=active"

# Get featured products
curl "http://localhost:3000/products?isFeatured=true&status=active"

# Update product
curl -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"price": 24.99}'

# Delete product
curl -X DELETE http://localhost:3000/products/1 \
  -H "Authorization: Bearer <token>"
```
