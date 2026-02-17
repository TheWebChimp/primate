/**
 * Product Service
 *
 * This is an example custom service file for a Primate project.
 * Place this in: entities/products/product.service.js
 *
 * Custom services allow you to add business logic through hooks
 * that run before/after CRUD operations.
 */
import { PrimateService } from '@thewebchimp/primate';
import slugify from 'slugify';

class ProductService {
	/**
	 * Hook: Before creating a product
	 * - Generate unique slug from name
	 * - Set default values
	 */
	static async beforeCreate(data, options = {}) {
		// Generate slug from name if not provided
		if (data.name && !data.slug) {
			let baseSlug = slugify(data.name, {
				lower: true,
				strict: true,
				trim: true,
			});

			// Ensure unique slug
			let slug = baseSlug;
			let counter = 1;

			while (await PrimateService.findBy('product', { slug })) {
				slug = `${baseSlug}-${counter}`;
				counter++;
			}

			data.slug = slug;
		}

		// Set default status if not provided
		if (!data.status) {
			data.status = 'draft';
		}

		// Ensure stock is non-negative
		if (data.stock !== undefined) {
			data.stock = Math.max(0, parseInt(data.stock, 10) || 0);
		}

		return data;
	}

	/**
	 * Hook: After creating a product
	 * - Log creation
	 * - Could send notifications, update inventory system, etc.
	 */
	static async afterCreate(record, options = {}) {
		console.log(`Product created: ${record.name} (ID: ${record.id})`);

		// Example: Could trigger inventory sync, send notification, etc.
		// await InventoryService.syncProduct(record.id);
		// await NotificationService.notify('product_created', record);

		return record;
	}

	/**
	 * Hook: Before updating a product
	 * - Regenerate slug if name changed
	 * - Validate stock changes
	 */
	static async beforeUpdate(data, options = {}) {
		// Regenerate slug if name is being updated
		if (data.name) {
			const baseSlug = slugify(data.name, {
				lower: true,
				strict: true,
				trim: true,
			});

			// Check if slug already exists (excluding current record)
			const existing = await PrimateService.findBy('product', { slug: baseSlug });

			if (existing && existing.id !== options.id) {
				// Slug exists, add counter
				let slug = baseSlug;
				let counter = 1;

				while (await PrimateService.findBy('product', { slug })) {
					slug = `${baseSlug}-${counter}`;
					counter++;
					if (counter > 100) break; // Safety limit
				}

				data.slug = slug;
			} else {
				data.slug = baseSlug;
			}
		}

		// Ensure stock is non-negative
		if (data.stock !== undefined) {
			data.stock = Math.max(0, parseInt(data.stock, 10) || 0);
		}

		return data;
	}

	/**
	 * Hook: After updating a product
	 * - Log changes
	 * - Handle status transitions
	 */
	static async afterUpdate(record, options = {}) {
		console.log(`Product updated: ${record.name} (ID: ${record.id})`);

		// Example: Handle low stock alert
		if (record.stock <= record.lowStockAlert) {
			console.warn(`Low stock alert: ${record.name} has ${record.stock} units`);
			// await NotificationService.notify('low_stock', record);
		}

		return record;
	}

	/**
	 * Hook: Before deleting a product
	 * - Check for dependencies
	 * - Could prevent deletion if product has orders
	 */
	static async beforeDelete(id, options = {}) {
		const product = await PrimateService.findById('product', id);

		if (!product) {
			throw new Error('Product not found');
		}

		// Example: Check if product has active orders
		// const activeOrders = await PrimateService.all('orderItem', {}, {
		//   where: { idProduct: id }
		// });
		//
		// if (activeOrders.count > 0) {
		//   throw new Error('Cannot delete product with existing orders');
		// }

		console.log(`Preparing to delete product: ${product.name} (ID: ${id})`);

		return id;
	}

	/**
	 * Hook: After deleting a product
	 * - Cleanup related data
	 * - Log deletion
	 */
	static async afterDelete(record, options = {}) {
		console.log(`Product deleted: ID ${record.id}`);

		// Example: Could remove from search index, clean up images, etc.
		// await SearchService.removeFromIndex('products', record.id);
		// await StorageService.deleteProductImages(record.id);

		return record;
	}

	/**
	 * Hook: After getting a single product
	 * - Transform data
	 * - Add computed fields
	 */
	static async afterGet(record, options = {}) {
		if (!record) return record;

		// Add computed fields
		record.isInStock = record.stock > 0;
		record.isLowStock = record.stock > 0 && record.stock <= (record.lowStockAlert || 5);

		// Calculate discount percentage if compareAtPrice exists
		if (record.compareAtPrice && record.compareAtPrice > record.price) {
			record.discountPercent = Math.round(
				((record.compareAtPrice - record.price) / record.compareAtPrice) * 100,
			);
		}

		return record;
	}

	/**
	 * Hook: After getting all products
	 * - Transform data for list view
	 * - Add computed fields to each record
	 */
	static async afterAll(records, options = {}) {
		return records.map(record => {
			record.isInStock = record.stock > 0;
			record.isLowStock = record.stock > 0 && record.stock <= (record.lowStockAlert || 5);

			if (record.compareAtPrice && record.compareAtPrice > record.price) {
				record.discountPercent = Math.round(
					((record.compareAtPrice - record.price) / record.compareAtPrice) * 100,
				);
			}

			return record;
		});
	}

	// ============================================
	// Custom Methods (Optional)
	// ============================================

	/**
	 * Update product stock
	 * @param {number} id - Product ID
	 * @param {number} quantity - Quantity to add (positive) or subtract (negative)
	 * @returns {Promise<Object>} Updated product
	 */
	static async updateStock(id, quantity) {
		const product = await PrimateService.findById('product', id);

		if (!product) {
			throw new Error('Product not found');
		}

		const newStock = Math.max(0, product.stock + quantity);

		return PrimateService.update('product', id, { stock: newStock });
	}

	/**
	 * Get products by category
	 * @param {number} categoryId - Category ID
	 * @param {Object} query - Query parameters
	 * @returns {Promise<Object>} Products list with count
	 */
	static async getByCategory(categoryId, query = {}) {
		return PrimateService.all('product', query, {
			where: {
				idCategory: categoryId,
				status: 'active',
			},
		});
	}

	/**
	 * Search products
	 * @param {string} searchTerm - Search term
	 * @param {Object} query - Query parameters
	 * @returns {Promise<Object>} Products list with count
	 */
	static async search(searchTerm, query = {}) {
		return PrimateService.all('product', {
			...query,
			q: searchTerm,
		}, {
			where: { status: 'active' },
		});
	}
}

export default ProductService;
