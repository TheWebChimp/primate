/**
 * Product Schema (JOI Validation)
 *
 * This is an example validation schema file for a Primate project.
 * Place this in: entities/products/product.schema.js
 *
 * Validation runs automatically on create/update operations.
 */
import Joi from 'joi';

const productSchema = Joi.object({
	// Required fields
	name: Joi.string()
		.min(2)
		.max(255)
		.required()
		.messages({
			'string.empty': 'Product name is required',
			'string.min': 'Product name must be at least 2 characters',
			'string.max': 'Product name cannot exceed 255 characters',
		}),

	price: Joi.number()
		.positive()
		.precision(2)
		.required()
		.messages({
			'number.base': 'Price must be a number',
			'number.positive': 'Price must be greater than 0',
		}),

	// Optional fields with defaults
	slug: Joi.string()
		.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.max(255)
		.messages({
			'string.pattern.base': 'Slug must be lowercase with hyphens only',
		}),

	description: Joi.string()
		.max(5000)
		.allow('')
		.messages({
			'string.max': 'Description cannot exceed 5000 characters',
		}),

	shortDescription: Joi.string()
		.max(500)
		.allow('')
		.messages({
			'string.max': 'Short description cannot exceed 500 characters',
		}),

	sku: Joi.string()
		.alphanum()
		.max(50)
		.messages({
			'string.alphanum': 'SKU must contain only letters and numbers',
			'string.max': 'SKU cannot exceed 50 characters',
		}),

	compareAtPrice: Joi.number()
		.positive()
		.precision(2)
		.greater(Joi.ref('price'))
		.messages({
			'number.greater': 'Compare-at price must be greater than the regular price',
		}),

	cost: Joi.number()
		.positive()
		.precision(2)
		.messages({
			'number.positive': 'Cost must be greater than 0',
		}),

	stock: Joi.number()
		.integer()
		.min(0)
		.default(0)
		.messages({
			'number.min': 'Stock cannot be negative',
			'number.integer': 'Stock must be a whole number',
		}),

	lowStockAlert: Joi.number()
		.integer()
		.min(0)
		.default(5)
		.messages({
			'number.min': 'Low stock alert threshold cannot be negative',
		}),

	weight: Joi.number()
		.positive()
		.messages({
			'number.positive': 'Weight must be greater than 0',
		}),

	status: Joi.string()
		.valid('active', 'inactive', 'draft', 'archived', 'out_of_stock')
		.default('draft')
		.messages({
			'any.only': 'Status must be one of: active, inactive, draft, archived, out_of_stock',
		}),

	isFeatured: Joi.boolean()
		.default(false),

	// Relation IDs (foreign keys)
	idCategory: Joi.number()
		.integer()
		.positive()
		.messages({
			'number.positive': 'Category ID must be a positive number',
		}),

	idBrand: Joi.number()
		.integer()
		.positive()
		.messages({
			'number.positive': 'Brand ID must be a positive number',
		}),

	// Array fields
	images: Joi.array()
		.items(Joi.string().uri())
		.max(20)
		.messages({
			'array.max': 'Maximum 20 images allowed',
			'string.uri': 'Each image must be a valid URL',
		}),

	tags: Joi.array()
		.items(Joi.string().max(50))
		.max(20)
		.messages({
			'array.max': 'Maximum 20 tags allowed',
		}),

	// Nested objects (stored in metas)
	seo: Joi.object({
		title: Joi.string().max(60).messages({
			'string.max': 'SEO title should be under 60 characters',
		}),
		description: Joi.string().max(160).messages({
			'string.max': 'SEO description should be under 160 characters',
		}),
		keywords: Joi.array().items(Joi.string()),
	}),

	dimensions: Joi.object({
		length: Joi.number().positive(),
		width: Joi.number().positive(),
		height: Joi.number().positive(),
		unit: Joi.string().valid('cm', 'in', 'm').default('cm'),
	}),

	// Flexible metadata
	metas: Joi.object()
		.pattern(Joi.string(), Joi.any())
		.default({}),
});

export default productSchema;
