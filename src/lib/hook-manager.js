/**
 * HookManager - Centralized hook management for Primate service
 *
 * Provides a clean interface for registering and executing lifecycle hooks
 * with proper async support and error handling.
 */

/**
 * @typedef {'beforeCreate'|'afterCreate'|'beforeUpdate'|'afterUpdate'|'beforeDelete'|'afterDelete'|'beforeAll'|'afterAll'|'beforeGet'|'afterGet'} HookType
 */

/**
 * @typedef {Object} HookContext
 * @property {string} model - Model name
 * @property {Object} [data] - Data being processed
 * @property {number|string} [id] - Record ID
 * @property {Object} [options] - Service options
 * @property {Object} [record] - Resulting record (for after hooks)
 */

/**
 * @callback HookHandler
 * @param {any} data - Data to process (varies by hook type)
 * @param {HookContext} context - Hook context
 * @returns {Promise<any>|any} Processed data or void
 */

class HookManager {
	/**
	 * Valid hook types
	 * @type {HookType[]}
	 */
	static HOOK_TYPES = [
		'beforeCreate',
		'afterCreate',
		'beforeUpdate',
		'afterUpdate',
		'beforeDelete',
		'afterDelete',
		'beforeAll',
		'afterAll',
		'beforeGet',
		'afterGet',
	];

	/**
	 * Create a new HookManager
	 */
	constructor() {
		/** @type {Map<HookType, HookHandler[]>} */
		this.hooks = new Map();

		// Initialize empty arrays for each hook type
		HookManager.HOOK_TYPES.forEach(type => {
			this.hooks.set(type, []);
		});
	}

	/**
	 * Register a hook handler
	 * @param {HookType} type - Hook type
	 * @param {HookHandler} handler - Handler function
	 * @throws {Error} If type is invalid or handler is not a function
	 */
	register(type, handler) {
		if(!HookManager.HOOK_TYPES.includes(type)) {
			throw new Error(`Invalid hook type: ${type}. Valid types: ${HookManager.HOOK_TYPES.join(', ')}`);
		}
		if(typeof handler !== 'function') {
			throw new Error('Hook handler must be a function');
		}

		this.hooks.get(type).push(handler);
	}

	/**
	 * Unregister a hook handler
	 * @param {HookType} type - Hook type
	 * @param {HookHandler} handler - Handler function to remove
	 * @returns {boolean} True if handler was found and removed
	 */
	unregister(type, handler) {
		if(!this.hooks.has(type)) return false;

		const handlers = this.hooks.get(type);
		const index = handlers.indexOf(handler);

		if(index !== -1) {
			handlers.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Clear all handlers for a hook type
	 * @param {HookType} type - Hook type
	 */
	clear(type) {
		if(this.hooks.has(type)) {
			this.hooks.set(type, []);
		}
	}

	/**
	 * Clear all hooks
	 */
	clearAll() {
		HookManager.HOOK_TYPES.forEach(type => {
			this.hooks.set(type, []);
		});
	}

	/**
	 * Check if a hook type has any handlers
	 * @param {HookType} type - Hook type
	 * @returns {boolean} True if has handlers
	 */
	hasHandlers(type) {
		return this.hooks.has(type) && this.hooks.get(type).length > 0;
	}

	/**
	 * Execute all handlers for a hook type
	 * Handlers are executed in order and can modify the data
	 *
	 * @param {HookType} type - Hook type
	 * @param {any} data - Initial data
	 * @param {HookContext} context - Hook context
	 * @returns {Promise<any>} Processed data
	 */
	async execute(type, data, context = {}) {
		const handlers = this.hooks.get(type) || [];

		if(handlers.length === 0) {
			return data;
		}

		let result = data;

		for(const handler of handlers) {
			try {
				const handlerResult = await handler(result, context);
				// If handler returns undefined, keep current result
				// Otherwise, use the returned value
				if(handlerResult !== undefined) {
					result = handlerResult;
				}
			} catch(error) {
				// Re-throw with context information
				const contextInfo = `[${type}] ${context.model || 'unknown'}`;
				error.message = `Hook error ${contextInfo}: ${error.message}`;
				throw error;
			}
		}

		return result;
	}

	/**
	 * Execute handlers with entity service hooks
	 * This method checks for entity-specific hooks (from service files) first
	 *
	 * @param {HookType} type - Hook type
	 * @param {any} data - Initial data
	 * @param {HookContext} context - Hook context
	 * @param {Object} [entityHooks] - Entity-specific hooks object
	 * @returns {Promise<any>} Processed data
	 */
	async executeWithEntityHooks(type, data, context, entityHooks = null) {
		let result = data;

		// Execute entity-specific hook first (if exists)
		if(entityHooks && typeof entityHooks[type] === 'function') {
			try {
				const hookResult = await entityHooks[type](result, context);
				if(hookResult !== undefined) {
					result = hookResult;
				}
			} catch(error) {
				const contextInfo = `[entity:${type}] ${context.model || 'unknown'}`;
				error.message = `Hook error ${contextInfo}: ${error.message}`;
				throw error;
			}
		}

		// Then execute global hooks
		result = await this.execute(type, result, context);

		return result;
	}

	/**
	 * Create a chainable hook builder
	 * @returns {HookBuilder}
	 */
	builder() {
		return new HookBuilder(this);
	}
}

/**
 * Fluent API for building hooks
 */
class HookBuilder {
	/**
	 * @param {HookManager} manager
	 */
	constructor(manager) {
		this.manager = manager;
	}

	/**
	 * Add a beforeCreate hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	beforeCreate(handler) {
		this.manager.register('beforeCreate', handler);
		return this;
	}

	/**
	 * Add an afterCreate hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	afterCreate(handler) {
		this.manager.register('afterCreate', handler);
		return this;
	}

	/**
	 * Add a beforeUpdate hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	beforeUpdate(handler) {
		this.manager.register('beforeUpdate', handler);
		return this;
	}

	/**
	 * Add an afterUpdate hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	afterUpdate(handler) {
		this.manager.register('afterUpdate', handler);
		return this;
	}

	/**
	 * Add a beforeDelete hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	beforeDelete(handler) {
		this.manager.register('beforeDelete', handler);
		return this;
	}

	/**
	 * Add an afterDelete hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	afterDelete(handler) {
		this.manager.register('afterDelete', handler);
		return this;
	}

	/**
	 * Add a beforeAll hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	beforeAll(handler) {
		this.manager.register('beforeAll', handler);
		return this;
	}

	/**
	 * Add an afterAll hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	afterAll(handler) {
		this.manager.register('afterAll', handler);
		return this;
	}

	/**
	 * Add a beforeGet hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	beforeGet(handler) {
		this.manager.register('beforeGet', handler);
		return this;
	}

	/**
	 * Add an afterGet hook
	 * @param {HookHandler} handler
	 * @returns {HookBuilder}
	 */
	afterGet(handler) {
		this.manager.register('afterGet', handler);
		return this;
	}
}

export default HookManager;
export { HookManager, HookBuilder };
