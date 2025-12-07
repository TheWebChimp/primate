/**
 * Unit tests for HookManager class
 */
import { HookManager, HookBuilder } from '../../src/lib/hook-manager.js';

describe('HookManager', () => {
	let hookManager;

	beforeEach(() => {
		hookManager = new HookManager();
	});

	describe('constructor', () => {
		it('should initialize all hook types with empty arrays', () => {
			HookManager.HOOK_TYPES.forEach(type => {
				expect(hookManager.hasHandlers(type)).toBe(false);
			});
		});
	});

	describe('register', () => {
		it('should register a handler for a valid hook type', () => {
			const handler = jest.fn();
			hookManager.register('beforeCreate', handler);
			expect(hookManager.hasHandlers('beforeCreate')).toBe(true);
		});

		it('should throw error for invalid hook type', () => {
			expect(() => {
				hookManager.register('invalidHook', jest.fn());
			}).toThrow(/Invalid hook type/);
		});

		it('should throw error if handler is not a function', () => {
			expect(() => {
				hookManager.register('beforeCreate', 'not a function');
			}).toThrow(/must be a function/);
		});

		it('should allow multiple handlers for same hook type', () => {
			hookManager.register('beforeCreate', jest.fn());
			hookManager.register('beforeCreate', jest.fn());
			expect(hookManager.hooks.get('beforeCreate').length).toBe(2);
		});
	});

	describe('unregister', () => {
		it('should remove a registered handler', () => {
			const handler = jest.fn();
			hookManager.register('beforeCreate', handler);
			const result = hookManager.unregister('beforeCreate', handler);
			expect(result).toBe(true);
			expect(hookManager.hasHandlers('beforeCreate')).toBe(false);
		});

		it('should return false if handler not found', () => {
			const handler = jest.fn();
			const result = hookManager.unregister('beforeCreate', handler);
			expect(result).toBe(false);
		});

		it('should return false for non-existent hook type', () => {
			const result = hookManager.unregister('invalidHook', jest.fn());
			expect(result).toBe(false);
		});
	});

	describe('clear', () => {
		it('should clear all handlers for a hook type', () => {
			hookManager.register('beforeCreate', jest.fn());
			hookManager.register('beforeCreate', jest.fn());
			hookManager.clear('beforeCreate');
			expect(hookManager.hasHandlers('beforeCreate')).toBe(false);
		});
	});

	describe('clearAll', () => {
		it('should clear all hooks', () => {
			hookManager.register('beforeCreate', jest.fn());
			hookManager.register('afterCreate', jest.fn());
			hookManager.register('beforeUpdate', jest.fn());
			hookManager.clearAll();
			HookManager.HOOK_TYPES.forEach(type => {
				expect(hookManager.hasHandlers(type)).toBe(false);
			});
		});
	});

	describe('execute', () => {
		it('should return data unchanged if no handlers', async () => {
			const data = { name: 'test' };
			const result = await hookManager.execute('beforeCreate', data);
			expect(result).toEqual(data);
		});

		it('should execute handlers in order', async () => {
			const order = [];
			hookManager.register('beforeCreate', async () => { order.push(1); });
			hookManager.register('beforeCreate', async () => { order.push(2); });
			hookManager.register('beforeCreate', async () => { order.push(3); });
			await hookManager.execute('beforeCreate', {});
			expect(order).toEqual([1, 2, 3]);
		});

		it('should pass modified data to next handler', async () => {
			hookManager.register('beforeCreate', (data) => ({ ...data, step1: true }));
			hookManager.register('beforeCreate', (data) => ({ ...data, step2: true }));
			const result = await hookManager.execute('beforeCreate', { initial: true });
			expect(result).toEqual({ initial: true, step1: true, step2: true });
		});

		it('should handle async handlers', async () => {
			hookManager.register('beforeCreate', async (data) => {
				await new Promise(resolve => setTimeout(resolve, 10));
				return { ...data, async: true };
			});
			const result = await hookManager.execute('beforeCreate', {});
			expect(result.async).toBe(true);
		});

		it('should re-throw errors with context', async () => {
			hookManager.register('beforeCreate', () => {
				throw new Error('Handler error');
			});
			await expect(hookManager.execute('beforeCreate', {}, { model: 'user' }))
				.rejects.toThrow(/Hook error.*beforeCreate.*user/);
		});

		it('should keep current result if handler returns undefined', async () => {
			hookManager.register('beforeCreate', (data) => ({ ...data, modified: true }));
			hookManager.register('beforeCreate', () => undefined);
			const result = await hookManager.execute('beforeCreate', { initial: true });
			expect(result).toEqual({ initial: true, modified: true });
		});
	});

	describe('executeWithEntityHooks', () => {
		it('should execute entity hooks before global hooks', async () => {
			const order = [];
			const entityHooks = {
				beforeCreate: async () => { order.push('entity'); }
			};
			hookManager.register('beforeCreate', async () => { order.push('global'); });

			await hookManager.executeWithEntityHooks('beforeCreate', {}, {}, entityHooks);
			expect(order).toEqual(['entity', 'global']);
		});

		it('should work without entity hooks', async () => {
			hookManager.register('beforeCreate', (data) => ({ ...data, global: true }));
			const result = await hookManager.executeWithEntityHooks('beforeCreate', { initial: true }, {});
			expect(result).toEqual({ initial: true, global: true });
		});

		it('should pass modified data from entity hook to global hooks', async () => {
			const entityHooks = {
				beforeCreate: (data) => ({ ...data, entity: true })
			};
			hookManager.register('beforeCreate', (data) => {
				expect(data.entity).toBe(true);
				return { ...data, global: true };
			});

			const result = await hookManager.executeWithEntityHooks('beforeCreate', {}, {}, entityHooks);
			expect(result).toEqual({ entity: true, global: true });
		});
	});

	describe('builder', () => {
		it('should return a HookBuilder instance', () => {
			const builder = hookManager.builder();
			expect(builder).toBeInstanceOf(HookBuilder);
		});
	});
});

describe('HookBuilder', () => {
	let hookManager;
	let builder;

	beforeEach(() => {
		hookManager = new HookManager();
		builder = new HookBuilder(hookManager);
	});

	it('should provide fluent API for all hook types', () => {
		const handler = jest.fn();

		builder
			.beforeCreate(handler)
			.afterCreate(handler)
			.beforeUpdate(handler)
			.afterUpdate(handler)
			.beforeDelete(handler)
			.afterDelete(handler)
			.beforeAll(handler)
			.afterAll(handler)
			.beforeGet(handler)
			.afterGet(handler);

		HookManager.HOOK_TYPES.forEach(type => {
			expect(hookManager.hasHandlers(type)).toBe(true);
		});
	});

	it('should return builder for chaining', () => {
		const result = builder.beforeCreate(jest.fn());
		expect(result).toBe(builder);
	});
});
