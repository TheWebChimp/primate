/**
 * Enhanced hook system for PrimateService.
 */
class HookSystem {
	constructor() {
		// Initialize hooks with empty arrays for each event type
		this.hooks = {
			beforeAll: [],
			afterAll: [],
			beforeCreate: [],
			afterCreate: [],
			beforeUpdate: [],
			afterUpdate: [],
			beforeDelete: [],
			afterDelete: [],
			beforeGet: [],
			afterGet: [],
			// Add error hooks for each operation
			errorCreate: [],
			errorUpdate: [],
			errorDelete: [],
			errorAll: [],
			errorGet: [],
		};

		// Track registered hooks for better management
		this.registeredHooks = new Map();
	}

	/**
	 * Adds a hook function for the specified event.
	 *
	 * @param {string} event - The hook event name.
	 * @param {Function} fn - The hook function to execute.
	 * @param {Object} options - Hook configuration options.
	 * @param {string} [options.id] - Unique identifier for the hook.
	 * @param {number} [options.priority=10] - Priority of the hook (lower numbers run first).
	 * @param {boolean} [options.once=false] - Whether the hook should run only once.
	 * @returns {string} The ID of the registered hook.
	 * @throws {Error} If the hook event is invalid.
	 */
	addHook(event, fn, options = {}) {
		if(!this.hooks[event]) {
			throw new Error(`Invalid hook event: ${ event }`);
		}

		const hookId = options.id || `hook_${ event }_${ Date.now() }_${ Math.random().toString(36).substr(2, 9) }`;
		const priority = options.priority || 10;
		const once = !!options.once;

		this.hooks[event].push({ fn, id: hookId, priority, once });

		// Sort hooks by priority (lower numbers first)
		this.hooks[event].sort((a, b) => a.priority - b.priority);

		// Store the hook for reference
		this.registeredHooks.set(hookId, { event, fn, options });

		return hookId;
	}

	/**
	 * Removes a hook by its ID.
	 *
	 * @param {string} hookId - The ID of the hook to remove.
	 * @returns {boolean} True if the hook was found and removed, false otherwise.
	 */
	removeHook(hookId) {
		if(!this.registeredHooks.has(hookId)) {
			return false;
		}

		const hookInfo = this.registeredHooks.get(hookId);
		const { event } = hookInfo;

		this.hooks[event] = this.hooks[event].filter(hook => hook.id !== hookId);
		this.registeredHooks.delete(hookId);

		return true;
	}

	/**
	 * Removes all hooks for a specific event.
	 *
	 * @param {string} event - The hook event name.
	 * @returns {number} The number of hooks removed.
	 */
	removeAllHooks(event) {
		if(!this.hooks[event]) {
			return 0;
		}

		const count = this.hooks[event].length;

		// Remove hooks from the registration map
		this.hooks[event].forEach(hook => {
			this.registeredHooks.delete(hook.id);
		});

		// Clear the hooks array
		this.hooks[event] = [];

		return count;
	}

	/**
	 * Runs all hooks for a specific event with the provided context.
	 *
	 * @param {string} event - The hook event name.
	 * @param {Object} context - The context object to pass to each hook.
	 * @returns {Promise<Object>} The modified context after running all hooks.
	 */
	async runHooks(event, context) {
		if(!this.hooks[event] || this.hooks[event].length === 0) {
			return context;
		}

		// Create a working copy of hooks to handle "once" hooks
		const hooksToRun = [ ...this.hooks[event] ];
		const oncesToRemove = [];

		try {
			// Run each hook in sequence
			for(const hook of hooksToRun) {
				// Execute the hook function
				const result = await hook.fn(context);

				// If hook returns a value, update the context
				if(result !== undefined) {
					context = result;
				}

				// Mark hook for removal if it's a "once" hook
				if(hook.once) {
					oncesToRemove.push(hook.id);
				}
			}

			// Remove "once" hooks
			oncesToRemove.forEach(id => this.removeHook(id));

			return context;
		} catch(error) {
			// Handle error by running error hooks if they exist
			const errorEvent = `error${ event.replace(/^(before|after)/, '') }`;

			if(this.hooks[errorEvent] && this.hooks[errorEvent].length > 0) {
				await this.runHooks(errorEvent, { ...context, error });
			}

			throw error;
		}
	}

	/**
	 * Returns hook statistics.
	 *
	 * @returns {Object} Statistics about registered hooks.
	 */
	getStats() {
		const stats = {
			totalHooks: this.registeredHooks.size,
			hooksByEvent: {},
		};

		// Count hooks by event
		for(const [ event, hooks ] of Object.entries(this.hooks)) {
			stats.hooksByEvent[event] = hooks.length;
		}

		return stats;
	}
}

// Example integration with PrimateService
export default HookSystem;