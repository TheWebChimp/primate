/**
 * Products Entity Router
 *
 * This is an example entity file for a Primate project.
 * Place this in: entities/products/products.js
 */
import { Primate, auth, PrimateService } from '@thewebchimp/primate';

const router = Primate.getRouter();

// Setup CRUDAG routes for the Product model
Primate.setupRoute('product', router, {
	// Fields to search when ID is not numeric (e.g., GET /products/my-widget)
	searchField: ['slug', 'sku'],

	// Fields searchable via ?q= parameter
	queryableFields: ['name', 'description', 'sku', 'status'],

	// Default relations to include (optional)
	// include: { category: true },

	// Authentication options (all enabled by default)
	// disableAuth: false,
	// disableCreateAuth: false,
	// disableAllAuth: false,
	// disableGetAuth: false,
	// disableUpdateAuth: false,
	// disableDeleteAuth: false,
});

// ============================================
// Custom Endpoints (Optional)
// ============================================

/**
 * GET /products/featured
 * Get featured products (public endpoint)
 */
router.get('/featured', async (req, res) => {
	try {
		const result = await PrimateService.all('product', {
			...req.query,
			limit: req.query.limit || 10,
		}, {
			where: {
				isFeatured: true,
				status: 'active',
			},
		});

		res.respond({
			data: result.data,
			count: result.count,
			message: 'Featured products retrieved',
		});
	} catch (error) {
		res.respond({
			status: 500,
			message: error.message,
		});
	}
});

/**
 * GET /products/slug/:slug
 * Get product by slug (public endpoint)
 */
router.get('/slug/:slug', async (req, res) => {
	try {
		const product = await PrimateService.findBy('product', {
			slug: req.params.slug,
			status: 'active',
		});

		if (!product) {
			return res.respond({
				status: 404,
				message: 'Product not found',
			});
		}

		res.respond({ data: product });
	} catch (error) {
		res.respond({
			status: 500,
			message: error.message,
		});
	}
});

/**
 * PUT /products/:id/stock
 * Update product stock (protected endpoint)
 */
router.put('/:id/stock', auth, async (req, res) => {
	try {
		const { quantity, operation } = req.body;

		if (typeof quantity !== 'number') {
			return res.respond({
				status: 400,
				message: 'Quantity must be a number',
			});
		}

		const product = await PrimateService.findById('product', req.params.id);
		if (!product) {
			return res.respond({
				status: 404,
				message: 'Product not found',
			});
		}

		let newStock = product.stock;
		if (operation === 'add') {
			newStock += quantity;
		} else if (operation === 'subtract') {
			newStock = Math.max(0, newStock - quantity);
		} else {
			newStock = quantity;
		}

		const updated = await PrimateService.update('product', req.params.id, {
			stock: newStock,
		});

		res.respond({
			data: updated,
			message: `Stock updated to ${newStock}`,
		});
	} catch (error) {
		res.respond({
			status: 500,
			message: error.message,
		});
	}
});

/**
 * PUT /products/bulk/status
 * Bulk update product status (protected endpoint)
 */
router.put('/bulk/status', auth, async (req, res) => {
	try {
		const { ids, status } = req.body;

		if (!Array.isArray(ids) || ids.length === 0) {
			return res.respond({
				status: 400,
				message: 'IDs array is required',
			});
		}

		if (!['active', 'inactive', 'draft', 'archived'].includes(status)) {
			return res.respond({
				status: 400,
				message: 'Invalid status value',
			});
		}

		const updated = await Promise.all(
			ids.map(id => PrimateService.update('product', id, { status })),
		);

		res.respond({
			data: updated,
			count: updated.length,
			message: `Updated ${updated.length} products`,
		});
	} catch (error) {
		res.respond({
			status: 500,
			message: error.message,
		});
	}
});

export { router };
