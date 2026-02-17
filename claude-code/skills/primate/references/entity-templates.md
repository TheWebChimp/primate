# Entity Templates

Complete code templates for Primate entity generation.

## Router File Template

```javascript
// entities/{plural}/{plural}.js
import { Primate } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('{modelName}', router, {
    // Fields for single record lookup when ID is not numeric
    // e.g., GET /users/john will search by username
    searchField: ['{primarySearchField}'],

    // Fields searchable via ?q= parameter
    queryableFields: [{queryFields}],

    // Authentication options (uncomment to disable)
    // disableAuth: true,        // Disable all auth
    // disableCreateAuth: true,  // Public POST /
    // disableAllAuth: true,     // Public GET /
    // disableGetAuth: true,     // Public GET /:id
    // disableUpdateAuth: true,  // Public PUT /:id
    // disableDeleteAuth: true,  // Public DELETE /:id
    // disableMetasAuth: true,   // Public PUT /:id/metas
});

export { router };
```

## Router with Custom Endpoints

```javascript
// entities/{plural}/{plural}.js
import { Primate, auth, PrimateService } from '@thewebchimp/primate';

const router = Primate.getRouter();

Primate.setupRoute('{modelName}', router, {
    queryableFields: [{queryFields}],
});

// Custom endpoint: Get by slug
router.get('/slug/:slug', async (req, res) => {
    try {
        const record = await PrimateService.findBy('{modelName}', {
            slug: req.params.slug
        });
        if (!record) {
            return res.respond({ status: 404, message: 'Not found' });
        }
        res.respond({ data: record });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});

// Custom endpoint: Bulk status update
router.put('/bulk/status', auth, async (req, res) => {
    try {
        const { ids, status } = req.body;
        const results = await Promise.all(
            ids.map(id => PrimateService.update('{modelName}', id, { status }))
        );
        res.respond({ data: results, count: results.length });
    } catch (error) {
        res.respond({ status: 500, message: error.message });
    }
});

export { router };
```

## Service File Template (Basic)

```javascript
// entities/{plural}/{singular}.service.js
import { PrimateService } from '@thewebchimp/primate';

class {ModelName}Service {
    static async beforeCreate(data, options = {}) {
        // Transform data before creation
        return data;
    }

    static async afterCreate(record, options = {}) {
        // Post-process after creation
        return record;
    }

    static async beforeUpdate(data, options = {}) {
        // Transform data before update
        return data;
    }

    static async afterUpdate(record, options = {}) {
        // Post-process after update
        return record;
    }

    static async afterGet(record, options = {}) {
        // Filter/transform single record
        return record;
    }

    static async afterAll(records, options = {}) {
        // Filter/transform multiple records
        return records;
    }
}

export default {ModelName}Service;
```

## Service File Template (With Password Hashing)

```javascript
// entities/users/user.service.js
import { PrimateService } from '@thewebchimp/primate';
import bcrypt from 'bcrypt';

class UserService {
    static sensitiveFields = ['password', 'resetToken', 'verificationToken'];

    static removeSensitiveFields(record) {
        if (!record) return record;
        const clean = { ...record };
        this.sensitiveFields.forEach(field => delete clean[field]);
        return clean;
    }

    static async beforeCreate(data, options = {}) {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        return data;
    }

    static async beforeUpdate(data, options = {}) {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        return data;
    }

    static async afterCreate(record, options = {}) {
        return this.removeSensitiveFields(record);
    }

    static async afterUpdate(record, options = {}) {
        return this.removeSensitiveFields(record);
    }

    static async afterGet(record, options = {}) {
        return this.removeSensitiveFields(record);
    }

    static async afterAll(records, options = {}) {
        return records.map(r => this.removeSensitiveFields(r));
    }

    // Custom method: Verify password
    static async verifyPassword(email, password) {
        const user = await PrimateService.findBy('user', { email });
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? this.removeSensitiveFields(user) : null;
    }
}

export default UserService;
```

## Service File Template (With Slug Generation)

```javascript
// entities/posts/post.service.js
import { PrimateService } from '@thewebchimp/primate';
import slugify from 'slugify';

class PostService {
    static async beforeCreate(data, options = {}) {
        // Generate slug from title
        if (data.title && !data.slug) {
            let baseSlug = slugify(data.title, { lower: true, strict: true });
            let slug = baseSlug;
            let counter = 1;

            // Ensure unique slug
            while (await PrimateService.findBy('post', { slug })) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
            data.slug = slug;
        }
        return data;
    }

    static async beforeUpdate(data, options = {}) {
        // Regenerate slug if title changed
        if (data.title) {
            data.slug = slugify(data.title, { lower: true, strict: true });
        }
        return data;
    }
}

export default PostService;
```

## Schema File Template (Basic)

```javascript
// entities/{plural}/{singular}.schema.js
import Joi from 'joi';

const {modelName}Schema = Joi.object({
    // String field (required)
    name: Joi.string().min(1).max(255).required(),

    // String field (optional)
    description: Joi.string().max(2000).allow(''),

    // Email field
    email: Joi.string().email().required(),

    // Number field
    price: Joi.number().positive().precision(2),

    // Integer field
    quantity: Joi.number().integer().min(0).default(0),

    // Boolean field
    isActive: Joi.boolean().default(true),

    // Enum/Choice field
    status: Joi.string().valid('draft', 'published', 'archived').default('draft'),

    // Date field
    publishDate: Joi.date().iso(),

    // Array field
    tags: Joi.array().items(Joi.string()),

    // Nested object
    metadata: Joi.object({
        seoTitle: Joi.string().max(60),
        seoDescription: Joi.string().max(160),
    }),
});

export default {modelName}Schema;
```

## Schema File Template (User Registration)

```javascript
// entities/users/user.schema.js
import Joi from 'joi';

const userSchema = Joi.object({
    username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required()
        .messages({
            'string.alphanum': 'Username must only contain letters and numbers',
            'string.min': 'Username must be at least 3 characters',
        }),

    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
        }),

    password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain uppercase, lowercase, and number',
        }),

    confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .messages({
            'any.only': 'Passwords must match',
        }),

    firstName: Joi.string().max(50),
    lastName: Joi.string().max(50),

    role: Joi.string()
        .valid('user', 'admin', 'moderator')
        .default('user'),

    status: Joi.string()
        .valid('active', 'inactive', 'pending')
        .default('pending'),
});

export default userSchema;
```

## Schema File Template (Product)

```javascript
// entities/products/product.schema.js
import Joi from 'joi';

const productSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(255)
        .required(),

    slug: Joi.string()
        .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(255),

    description: Joi.string()
        .max(5000)
        .allow(''),

    shortDescription: Joi.string()
        .max(500)
        .allow(''),

    sku: Joi.string()
        .alphanum()
        .max(50),

    price: Joi.number()
        .positive()
        .precision(2)
        .required(),

    compareAtPrice: Joi.number()
        .positive()
        .precision(2)
        .greater(Joi.ref('price')),

    stock: Joi.number()
        .integer()
        .min(0)
        .default(0),

    status: Joi.string()
        .valid('active', 'inactive', 'draft', 'out_of_stock')
        .default('draft'),

    featured: Joi.boolean()
        .default(false),

    categories: Joi.array()
        .items(Joi.number().integer().positive()),

    tags: Joi.array()
        .items(Joi.string().max(50)),

    images: Joi.array()
        .items(Joi.string().uri()),
});

export default productSchema;
```
