import auth from '#middlewares/auth.js';
import Controller from './controller.js';
import slugify from 'slugify';
import chalk from 'chalk';
import * as changeCase from 'change-case';
import Primate from '../primate.js';
import logger from '#utils/logger.js';
import HookSystem from '#utils/hook-system.js';

/**
 * Generic service class for handling CRUD operations.
 */
class PrimateService {

	static prisma = null;
	static orm = null;
	static hookSystem = new HookSystem();

	static initialize(prismaInstance, orm) {
		PrimateService.prisma = prismaInstance;
		PrimateService.orm = orm;
	}

	// Hook methods
	/**
	 * Adds a hook function for the specified event.
	 *
	 * @param {string} event - The hook event name.
	 * @param {Function} fn - The hook function to execute.
	 * @param {Object} [options={}] - Hook configuration options.
	 * @param {string} [options.id] - Unique identifier for the hook.
	 * @param {number} [options.priority=10] - Priority of the hook (lower numbers run first).
	 * @param {boolean} [options.once=false] - Whether the hook should run only once.
	 * @returns {string} The ID of the registered hook.
	 */
	static addHook(event, fn, options = {}) {
		return PrimateService.hookSystem.addHook(event, fn, options);
	}

	/**
	 * Removes a hook by its ID.
	 *
	 * @param {string} hookId - The ID of the hook to remove.
	 * @returns {boolean} True if the hook was found and removed, false otherwise.
	 */
	static removeHook(hookId) {
		return PrimateService.hookSystem.removeHook(hookId);
	}

	/**
	 * Removes all hooks for a specific event.
	 *
	 * @param {string} event - The hook event name.
	 * @returns {number} The number of hooks removed.
	 */
	static removeAllHooks(event) {
		return PrimateService.hookSystem.removeAllHooks(event);
	}

	/**
	 * Runs hooks for a specific event with the provided context.
	 *
	 * @param {string} event - The hook event name.
	 * @param {Object} context - The context object to pass to each hook.
	 * @returns {Promise<Object>} The modified context after running all hooks.
	 */
	static async runHooks(event, context) {
		return await PrimateService.hookSystem.runHooks(event, context);
	}

	/**
	 * Gets hook system statistics.
	 *
	 * @returns {Object} Statistics about registered hooks.
	 */
	static getHookStats() {
		return PrimateService.hookSystem.getStats();
	}

	// The functions are in the following order: CrUDAG
	// Create, Update, Delete, All, Get

	// Create ----------------------------------------------------------------------------------------------------------
	/**
	 * Creates a new record in the database.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {Object} data - The data to be created.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.filterCreateData] - Function to filter create data.
	 * @param {Object} [options.upsertRules] - Rules for upsert operations.
	 * @returns {Promise<T>} The created record.
	 * @throws {Error} If any error occurs during creation.
	 */
	static async create(model, data, options = {}) {

		if(!model) throw new Error('Model is required to create an item.');

		let context = { model, data, options };
		try {
			try {
				// Run beforeCreate hooks
				context = await this.runHooks('beforeCreate', context);
				data = context.data; // Get potentially modified data from hooks

				data = await Primate.validateSchema(model, data);
			} catch(e) {
				throw new Error(e.message);
			}

			// convert the first letter of the model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			if(options.filterCreateData) data = await options.filterCreateData(data, model, options);

			// Get the fields of the model
			const modelFields = PrimateService.getORMObject(model);
			const relations = modelFields.relations || null;

			if(relations) {
				// Handle one-to-many and many-to-many relations
				for(const [ relationData ] of Object.entries(relations)) {
					if(relationData.type === 'one-to-many' && !!data[relationData.field]) {
						data[relationData.model] = {
							connect: {
								id: parseInt(data[relationData.field]),
							},
						};

						delete data[relationData.field];
					}

					if(relationData.type === 'many-to-many' && !!data[relationData.plural]) {
						if(Array.isArray(data[relationData.plural])) {
							data[relationData.plural] = {
								connect: data[relationData.plural].map(item =>
									typeof item === 'object' && item.hasOwnProperty('id')
										? { id: parseInt(item.id, 10) }
										: { id: parseInt(item, 10) },
								),
							};
						}
					}
				}
			}

			// Sanitize data to avoid errors
			data = this.sanitizeData(model, data);

			// Handle upsert rules if set
			if(options.upsertRules) {
				for(const [ field, rule ] of Object.entries(options.upsertRules)) {
					if(rule.slugify && data[rule.slugify]) {
						data[field] = slugify(data[rule.slugify], {
							lower: true,
						});
					}
				}
			}

			// Create the record
			const record = await PrimateService.prisma[model].create({ data });

			// Run afterCreate hooks
			await this.runHooks('afterCreate', { ...context, record });

			return record;

		} catch(e) {
			logger.error('Error creating record:', e);

			// Run errorCreate hooks
			await this.runHooks('errorCreate', { ...context, error });

			throw e;
		}
	}

	// Update ----------------------------------------------------------------------------------------------------------
	/**
	 * Updates a record in the database.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record to update.
	 * @param {Object} data - The data to update.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.filterUpdateData] - Function to filter update data.
	 * @param {string} [options.searchField] - Field to search for the record if ID is not a number.
	 * @returns {Promise<T>} The updated record.
	 * @throws {Error} If any error occurs during the update.
	 */
	static async update(model, id, data, options = {}) {

		if(!model) throw new Error('Model is required to update an item.');
		if(!id) throw new Error('ID is required to update an item.');

		let context = { model, id, data, options };
		try {
			// Run beforeUpdate hooks
			context = await this.runHooks('beforeUpdate', context);
			data = context.data; // Get potentially modified data from hooks

			// convert first letter of model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			if(options.filterUpdateData) {
				data = await options.filterUpdateData(data, model);
			}

			// Check relations to see if we need to connect
			// first get the fields of the model
			const modelFields = PrimateService.orm[model];
			const relations = modelFields['relations'] || null;

			if(relations) {
				// iterate over relations
				for(const [ relationData ] of Object.entries(relations)) {
					if(relationData.type === 'one-to-many' && !!data[relationData.field]) {
						data[relationData.model] = {
							connect: {
								id: parseInt(data[relationData.field]),
							},
						};

						delete data[relationData.field];
					}

					if(relationData.type === 'many-to-many' && !!data[relationData.plural]) {
						// check if the relation is an array
						if(Array.isArray(data[relationData.plural])) {

							// get current elements related to the model
							const entity = await PrimateService.prisma[model].findUnique({
								where: { id: parseInt(id) },
								select: {
									[relationData.plural]: true,
								},
							});

							// check if the relation is an array of objects with id
							if(typeof data[relationData.plural][0] === 'object' && data[relationData.plural][0].hasOwnProperty('id')) {

								// generate a list of the elements that need to be disconnected and connected
								const elementsToDisconnect = [];

								// compare the elements in the database with the elements sent
								entity[relationData.plural].forEach(element => {
									// if the user is not in the users sent, we disconnect it
									if(!data[relationData.plural].find((e) => e.id === element.id)) {
										elementsToDisconnect.push({ id: element.id });
									}
								});

								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item.id) })),
								};

								if(elementsToDisconnect.length > 0) data[relationData.plural].disconnect = elementsToDisconnect;

							} else {

								// generate a list of the elements that need to be disconnected and connected
								const elementsToDisconnect = [];

								// compare the elements in the database with the elements sent
								entity[relationData.plural].forEach(element => {
									// if the user is not in the users sent, we disconnect it
									if(!data[relationData.plural].find((e) => e === element.id)) {
										elementsToDisconnect.push({ id: element.id });
									}
								});

								// check if the relation is an array with plain ids
								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item) })),
								};

								if(elementsToDisconnect.length > 0) data[relationData.plural].disconnect = elementsToDisconnect;
							}
						}
					}
				}
			}

			// Sanitize data to avoid errors removing the fields that are not in the model
			data = this.sanitizeData(model, data);

			let where;
			// if option.searchFields exists && id is not a number
			if(options.searchField && isNaN(parseInt(id))) {
				// check if the model has the field
				if(modelFields.hasOwnProperty(options.searchField)) {
					where = {
						[options.searchField]: modelFields[options.searchField].type === 'Int' ? parseInt(id) : id,
					};
				}
			} else {
				where = { id: PrimateService.resolveId(model, id) };
			}

			// Update the record
			const record = await PrimateService.prisma[model].update({ where, data });

			// Run afterUpdate hooks
			const updatedContext = await this.runHooks('afterUpdate', { ...context, record });

			return updatedContext.record;

		} catch(e) {
			throw e;
		}
	}

	// Delete ----------------------------------------------------------------------------------------------------------
	/**
	 * Deletes a record by its ID from the specified model.
	 *
	 * @template T
	 * @param {number|string} id - The ID of the record to delete.
	 * @param {string} model - The name of the model.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.beforeDeleteCheck] - Function to check before deletion.
	 * @param {boolean} [options.softDelete] - Whether to perform a soft delete.
	 * @returns {Promise<T>} The deleted record.
	 * @throws {Error} If any required parameter is missing or an error occurs during deletion.
	 */
	static async delete(model, id, options = {}) {

		if(!model || typeof model !== 'string') throw new Error('Model is required to delete an item.');
		if(!id) throw new Error('ID is required to delete an item.');

		let context = { model, id };

		try {
			// Run beforeDelete hooks
			context = await this.runHooks('beforeDelete', context);

			// Convert the first letter of the model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			const ormObject = PrimateService.getORMObject(model);
			if(!ormObject) {
				throw new Error(`Model "${ model }" not found in PrimateService.orm.`);
			}

			// Determine where clause
			const where = PrimateService.resolveWhere(model, id);

			// Check if record exists and fetch it before deletion
			const existingRecord = await PrimateService.prisma[model].findFirst({ where });
			if(!existingRecord) {
				throw new Error(`${ model } with ID ${ id } not found.`);
			}

			// Custom pre-deletion check if provided
			if(options.beforeDeleteCheck) {
				await options.beforeDeleteCheck(existingRecord, model, id);
			}

			let record;

			// Handle soft delete if requested and supported by the model
			if(options.softDelete && ormObject.hasOwnProperty('deleted')) {
				record = await PrimateService.prisma[model].update({
					where,
					data: {
						deletedAt: new Date(),
					},
				});
			}
			// Otherwise perform hard delete
			else record = await PrimateService.prisma[model].delete({ where });

			// Run afterDelete hooks
			const updatedContext = await this.runHooks('afterDelete', { ...context, record });

			return updatedContext.record;

		} catch(e) {
			logger.error(`Error deleting ${ model } with ID ${ id }:`, e);
			throw e;
		}
	}

	// All -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a list of records from the specified model based on query parameters.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {Object} [query={}] - The query parameters.
	 * @param {number|string} [query.page=1] - The page number for pagination.
	 * @param {number|string} [query.limit=100] - The number of records per page.
	 * @param {string} [query.by='id'] - The field to sort by.
	 * @param {string} [query.order='desc'] - The sort order ('asc' or 'desc').
	 * @param {string} [query.q] - The search query.
	 * @param {string} [query.select] - Comma-separated list of fields to select.
	 * @param {boolean} [query.count] - Whether to return the total count of records.
	 * @param {boolean} [query.excludeDeleted=true] - Whether to exclude deleted records.
	 * @param {Object} [query.where] - Additional where conditions.
	 * @param {Object} [query.include] - Relations to include in the result.
	 * @param {Object} [query.fetch] - Relations to fetch.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.filterAllQuery] - Function to filter the query.
	 * @param {Function} [options.filterResultData] - Function to filter the result data.
	 * @param {Function} [options.queryableFields] - Fields that can be queried.
	 * @param {Function} [options.resolveWhere] - Function to resolve the where clause.
	 * @param {Function} [options.resolveId] - Function to resolve the ID.
	 * @param {Function} [options.include] - Relations to include in the result.
	 * @param {Function} [options.where] - Additional where conditions.
	 * @returns {Promise<{[T], number}>} The list of records and the total count.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async all(model, query = {}, options = {}) {

		if(!model || typeof model !== 'string') throw new Error('Model is required to get items.');

		let context = { model, query, options };

		try {
			// Run beforeAll hooks
			context = await this.runHooks('beforeAll', context);

			// Update query and options from context
			query = context.query;
			options = context.options;

			// Default values for pagination and sorting
			let {
				page = 1,
				limit = 100,
				by = 'id',
				order = 'desc',
				q,
				count: countQuery,
				select,
				excludeDeleted = true,
			} = query;

			// Convert string values to proper types
			page = parseInt(page, 10);
			limit = parseInt(limit, 10);

			// Prepare the query object
			let queryObject = {
				where: {},
				orderBy: { [by]: order },
			};

			// Handle search query (q)
			if(q) {
				await this._handleSearchQuery(model, q, queryObject, options);
			}

			// Handle field-specific filters
			await this._handleFieldFilters(model, query, queryObject);

			// Handle soft-delete filtering if model supports it
			const ormObject = PrimateService.getORMObject(model);
			if(excludeDeleted && ormObject.hasOwnProperty('deleted')) {
				queryObject.where.deleted = 0;
			}

			// Merge additional where conditions from options
			queryObject.where = {
				...options.where,
				...queryObject.where,
			};

			// Allow customization of the query object
			if(options.filterAllQuery) {
				queryObject = await options.filterAllQuery(query, queryObject, options) || queryObject;
			}

			// Count total records
			const totalCount = await PrimateService.prisma[model].count(queryObject);

			if(countQuery) return { data: [], count: totalCount };

			// Prepare arguments for findMany
			const args = {
				...queryObject,
				skip: (page - 1) * limit,
				take: limit,
			};

			// Process includes and selects
			await this._processIncludesAndSelects(model, query, args, options);

			// Retrieve data
			let data = await PrimateService.prisma[model].findMany(args);

			// Apply custom result filtering if provided
			if(options.filterResultData) {
				data = await options.filterResultData(data, query);
			}

			// Run afterAll hooks
			const updatedContext = await this.runHooks('afterAll', {
				...context,
				data,
				count: totalCount,
				queryObject,
				args,
			});

			// Return data and count, potentially modified by hooks
			return {
				data: updatedContext.data,
				count: updatedContext.count,
			};
		} catch(e) {
			logger.error(`Error retrieving ${ model }:`, e);

			// Run errorAll hooks
			await this.runHooks('errorAll', { ...context, error });

			throw new Error(`Error retrieving ${ model }: ${ e.message }`);
		}
	}

	/**
	 * Helper method to handle search query.
	 *
	 * @private
	 * @param {string} model - The model name.
	 * @param {string} q - The search query.
	 * @param {Object} queryObject - The query object to modify.
	 * @param {Object} options - The options object.
	 */
	static async _handleSearchQuery(model, q, queryObject, options) {
		if(!options.queryableFields) return;

		queryObject.where.OR = [];
		const modelFields = PrimateService.getORMObject(model);

		// Add ID to search if it is a number
		if(!isNaN(parseInt(q))) {
			queryObject.where.OR.push({ id: parseInt(q) });
		}

		options.queryableFields.forEach(field => {
			if(modelFields.hasOwnProperty(field)) {
				if(modelFields[field] === 'Int' && !isNaN(parseInt(q))) {
					queryObject.where.OR.push({ [field]: parseInt(q) });
				} else if(modelFields[field] === 'String') {
					queryObject.where.OR.push({ [field]: { contains: String(q) } });
				}
			} else if(field.includes('.')) {
				const [ relation, subfield ] = field.split('.');
				if(modelFields.hasOwnProperty(relation)) {
					queryObject.where.OR.push({ [relation]: { [subfield]: { contains: q } } });
				}
			}
		});
	}

	/**
	 * Helper method to handle field-specific filters.
	 *
	 * @private
	 * @param {string} model - The model name.
	 * @param {Object} query - The query parameters.
	 * @param {Object} queryObject - The query object to modify.
	 */
	static async _handleFieldFilters(model, query, queryObject) {
		Object.entries(PrimateService.orm[model]).forEach(([ field ]) => {
			if(query[field]) {
				if(typeof query[field] === 'string' && query[field].includes(',')) {
					// Handle IN filter (comma-separated values)
					queryObject.where[field] = {
						in: query[field].split(',').map(value => {
							if(PrimateService.orm[model][field] === 'Int') {
								return parseInt(value, 10);
							}
							return value;
						}),
					};
				} else if(typeof query[field] === 'string' && query[field].includes('|')) {
					// Handle HAS filter (pipe-separated values for array fields)
					queryObject.where[field] = {
						has: query[field].split('|'),
					};
				} else {
					// Handle simple equality filter
					if(PrimateService.orm[model][field] === 'String') {
						queryObject.where[field] = query[field] + '';
					} else if(PrimateService.orm[model][field] === 'Int') {
						queryObject.where[field] = parseInt(query[field], 10);
					} else if(PrimateService.orm[model][field] === 'Boolean') {
						queryObject.where[field] = query[field] === 'true';
					} else {
						queryObject.where[field] = query[field];
					}
				}
			}
		});
	}

	/**
	 * Helper method to process includes and selects.
	 *
	 * @private
	 * @param {string} model - The model name.
	 * @param {Object} query - The query parameters.
	 * @param {Object} args - The arguments object to modify.
	 * @param {Object} options - The options object.
	 */
	static async _processIncludesAndSelects(model, query, args, options) {
		// Handle select fields
		if(query.select) {
			args.select = {};
			const selectFields = query.select.includes(',')
				? query.select.split(',')
				: [ query.select ];

			selectFields.forEach(field => {
				if(PrimateService.orm[model].hasOwnProperty(field)) {
					args.select[field] = true;
				} else {
					logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '),
						`The field "${ field }" is not in the model "${ model }".`);
				}
			});
		}

		// Handle fetch relations via query (fetch-*)
		const fetchKeys = Object.keys(query)
			.filter(key => key.startsWith('fetch-'))
			.sort(); // Sort for consistent order

		for(const fetchKey of fetchKeys) {
			const entity = fetchKey.replace('fetch-', '');
			const value = query[fetchKey];

			// Convert entity to camelCase
			const entityCamel = changeCase.camelCase(entity);

			if(PrimateService.orm[model].hasOwnProperty(entityCamel)) {
				args.include = {
					...args.include,
					[entityCamel]: value === 1
						? true
						: { include: { [value]: true } },
				};
			}
		}

		// Add options.include to args.include
		if(options.include) {
			args.include = {
				...args.include,
				...options.include,
			};
		}
	}

	// Get -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a single record from the database based on the given ID and model.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record to retrieve.
	 * @param {Object} [query={}] - The query parameters.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.resolveWhere] - Function to resolve the where clause.
	 * @param {string[]} [options.searchField] - Fields to search if ID is not a number.
	 * @param {Function} [options.filterGetItem] - Function to filter the retrieved item.
	 * @param {Object} [options.include] - Relations to include.
	 * @param {boolean} [options.throwIfNotFound=true] - Whether to throw an error if the record is not found.
	 * @returns {Promise<T>} The retrieved record.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async get(model, id, query = {}, options = {}) {
		if(!id) throw new Error('ID is required to get an item.');
		if(!model || typeof model !== 'string') throw new Error('Model is required to get an item.');

		// Set default options
		options = {
			throwIfNotFound: true,
			...options,
		};

		let context = { model, id, query, options };

		try {
			// Run beforeGet hooks
			context = await this.runHooks('beforeGet', context);

			// Update query and options from context
			query = context.query;
			options = context.options;
			id = context.id;

			// Convert the first letter of the model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			const modelFields = PrimateService.orm[model];
			if(!modelFields) throw new Error(`Model "${ model }" not found in PrimateService.orm.`);

			// Prepare query arguments
			const args = await this._prepareGetArgs(model, id, query, options, modelFields);

			// Execute the query
			let record = await PrimateService.prisma[model].findFirst(args);

			// Handle not found case
			if(!record && options.throwIfNotFound) {
				throw new Error(`${ model } with ID ${ id } not found.`);
			}

			// Apply custom filtering if provided
			if(record && options.filterGetItem) {
				record = await options.filterGetItem(record, query);
			}

			// Run afterGet hooks
			const updatedContext = await this.runHooks('afterGet', {
				...context,
				record,
				args,
			});

			return updatedContext.record;
		} catch(e) {
			logger.error(`Error retrieving ${ model } with ID ${ id }:`, e);

			// Run errorGet hooks
			await this.runHooks('errorGet', { ...context, error });

			throw new Error(`Error retrieving ${ model }: ${ e.message }`);
		}
	}

	/**
	 * Helper method to prepare arguments for the get query.
	 *
	 * @private
	 * @param {string} model - The model name.
	 * @param {number|string} id - The ID of the record.
	 * @param {Object} query - The query parameters.
	 * @param {Object} options - The options object.
	 * @param {Object} modelFields - The model fields.
	 * @returns {Object} The prepared arguments for the query.
	 */
	static async _prepareGetArgs(model, id, query, options, modelFields) {
		const args = {};

		// Resolve where clause based on options and ID
		if(options.resolveWhere) {
			args.where = await options.resolveWhere(model, id);
		} else if(options.searchField && isNaN(parseInt(id, 10))) {
			const toSearch = options.searchField
				.filter(field => modelFields.hasOwnProperty(field))
				.map(field => ({
					[field]: modelFields[field].type === 'Int' ? parseInt(id, 10) : id,
				}));

			if(toSearch.length === 1) {
				args.where = toSearch[0];
			} else if(toSearch.length > 1) {
				args.where = { OR: toSearch };
			} else {
				// If no valid search fields, fall back to ID
				args.where = PrimateService.resolveWhere(model, id);
			}
		} else {
			args.where = PrimateService.resolveWhere(model, id);
		}

		// Handle soft-delete filtering
		if(query.includeDeleted !== true && modelFields.hasOwnProperty('deletedAt')) {
			args.where = {
				...args.where,
				deletedAt: null,
			};
		}

		// Process includes from query and options
		await this._processGetIncludes(model, query, args, options, modelFields);

		return args;
	}

	// Other functions -------------------------------------------------------------------------------------------------
	/**
	 * Sanitizes the data by handling and validating fields based on the model schema.
	 *
	 * @param {string} model - The name of the model.
	 * @param {Object} data - The data to be sanitized.
	 * @param {Object} [options={}] - Sanitization options.
	 * @param {boolean} [options.strict=false] - Whether to throw errors for invalid fields.
	 * @param {boolean} [options.cleanOnly=false] - Only remove invalid fields without transformations.
	 * @param {string[]} [options.allowedExtraFields=[]] - Extra fields to allow that aren't in the model.
	 * @param {Object} [options.transformations={}] - Custom field transformations.
	 * @returns {Object} The sanitized data.
	 * @throws {Error} If the model is not found or the parameters are invalid.
	 */
	static sanitizeData(model, data, options = {}) {
		// Validate parameters
		if(!data || typeof data !== 'object') {
			throw new Error('The "data" parameter must be a non-empty object.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		// Default options
		const {
			strict = false,
			cleanOnly = false,
			allowedExtraFields = [],
			transformations = {},
		} = options;

		// Get model definition
		const modelObject = PrimateService.getORMObject(model);
		if(!modelObject) {
			throw new Error(`Model "${ model }" not found in PrimateService.orm.`);
		}

		// Create a copy of the data to avoid modifying the original
		const sanitizedData = { ...data };

		// Track removed and transformed fields for logging
		const removedFields = [];
		const transformedFields = [];

		// Process each field in the input data
		for(const [ field, value ] of Object.entries(sanitizedData)) {
			// Skip if it's an allowed extra field
			if(allowedExtraFields.includes(field)) {
				continue;
			}

			// Check if field exists in model
			if(!modelObject.hasOwnProperty(field)) {
				// Handle invalid field
				if(strict) {
					throw new Error(`Field "${ field }" is not in the model "${ model }".`);
				} else {
					delete sanitizedData[field];
					removedFields.push(field);
				}
				continue;
			}

			// Skip transformations if cleanOnly is true
			if(cleanOnly) continue;

			// Apply field-specific transformations if provided
			if(transformations[field]) {
				try {
					sanitizedData[field] = transformations[field](value);
					transformedFields.push(field);
				} catch(error) {
					if(strict) {
						throw new Error(`Failed to transform field "${ field }": ${ error.message }`);
					} else {
						delete sanitizedData[field];
						removedFields.push(field);
					}
				}
				continue;
			}

			// Apply default transformations based on field type
			const fieldType = modelObject[field];

			try {
				sanitizedData[field] = this._applyDefaultTransformation(fieldType, value, field);
				if(sanitizedData[field] !== value) {
					transformedFields.push(field);
				}
			} catch(error) {
				if(strict) {
					throw new Error(`Invalid value for field "${ field }": ${ error.message }`);
				} else {
					delete sanitizedData[field];
					removedFields.push(field);
				}
			}
		}

		// Log sanitization results
		if(removedFields.length > 0) {
			logger.warn(
				chalk.bgYellow.black.italic(' ⚠️ WARNING '),
				`Removed invalid fields from "${ model }": ${ removedFields.join(', ') }`,
			);
		}

		if(transformedFields.length > 0 && !cleanOnly) {
			logger.info(
				chalk.bgBlue.white(' ℹ️ INFO '),
				`Transformed fields in "${ model }": ${ transformedFields.join(', ') }`,
			);
		}

		return sanitizedData;
	}

	/**
	 * Applies default transformation based on field type.
	 *
	 * @private
	 * @param {string} fieldType - The type of the field.
	 * @param {any} value - The value to transform.
	 * @param {string} fieldName - The name of the field (for error messages).
	 * @returns {any} The transformed value.
	 * @throws {Error} If the value cannot be transformed to the required type.
	 */
	static _applyDefaultTransformation(fieldType, value, fieldName) {
		// Handle null or undefined separately
		if(value === null || value === undefined) {
			return value;
		}

		// Apply transformations based on field type
		switch(fieldType) {
			case 'Int':
				// Convert strings to integers
				if(typeof value === 'string') {
					const parsed = parseInt(value, 10);
					if(isNaN(parsed)) {
						throw new Error(`Cannot convert "${ value }" to an integer.`);
					}
					return parsed;
				}
				// Check if value is a number
				if(typeof value !== 'number' || !Number.isInteger(value)) {
					throw new Error(`Value must be an integer.`);
				}
				return value;

			case 'Float':
				// Convert strings to floats
				if(typeof value === 'string') {
					const parsed = parseFloat(value);
					if(isNaN(parsed)) {
						throw new Error(`Cannot convert "${ value }" to a float.`);
					}
					return parsed;
				}
				// Check if value is a number
				if(typeof value !== 'number') {
					throw new Error(`Value must be a number.`);
				}
				return value;

			case 'String':
				// Convert other types to strings
				if(typeof value !== 'string') {
					return String(value);
				}
				return value;

			case 'Boolean':
				// Convert various formats to boolean
				if(typeof value === 'string') {
					const normalized = value.toLowerCase().trim();
					if([ 'true', 'yes', '1', 'on' ].includes(normalized)) {
						return true;
					}
					if([ 'false', 'no', '0', 'off' ].includes(normalized)) {
						return false;
					}
					throw new Error(`Cannot convert "${ value }" to a boolean.`);
				}
				// Convert numbers to boolean
				if(typeof value === 'number') {
					return value !== 0;
				}
				// Keep boolean as is
				if(typeof value === 'boolean') {
					return value;
				}
				throw new Error(`Cannot convert value to a boolean.`);

			case 'DateTime':
				// Convert string to Date object
				if(typeof value === 'string') {
					const date = new Date(value);
					if(isNaN(date.getTime())) {
						throw new Error(`Invalid date format: "${ value }".`);
					}
					return date;
				}
				// Keep Date objects
				if(value instanceof Date) {
					if(isNaN(value.getTime())) {
						throw new Error('Invalid Date object.');
					}
					return value;
				}
				throw new Error(`Cannot convert value to a date.`);

			case 'JSON':
				// Convert string to JSON
				if(typeof value === 'string') {
					try {
						return JSON.parse(value);
					} catch(error) {
						throw new Error(`Invalid JSON string: ${ error.message }`);
					}
				}
				// Keep objects and arrays
				if(typeof value === 'object') {
					return value;
				}
				throw new Error(`Cannot convert value to JSON.`);

			// Handle array types (e.g., String[])
			default:
				if(fieldType.endsWith('[]')) {
					if(!Array.isArray(value)) {
						// Try to convert string to array
						if(typeof value === 'string') {
							try {
								return JSON.parse(value);
							} catch(error) {
								// If not valid JSON, split by comma
								return value.split(',').map(item => item.trim());
							}
						}
						throw new Error(`Value must be an array.`);
					}
					return value;
				}

				// For other types, keep as is
				return value;
		}
	}

	/**
	 * Prepares CRUD and additional routes for a given model.
	 *
	 * @param {string|Object} modelOrController - The model name or an instance of a model controller.
	 * @param {Express.Router} router - The Express router.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {boolean} [options.disableAuth=false] - Disable authentication for all routes.
	 * @param {boolean} [options.disableCreateAuth=false] - Disable authentication for create routes.
	 * @param {boolean} [options.disableUpdateAuth=false] - Disable authentication for update routes.
	 * @param {boolean} [options.disableDeleteAuth=false] - Disable authentication for delete routes.
	 * @param {boolean} [options.disableAllAuth=false] - Disable authentication for all (list) routes.
	 * @param {boolean} [options.disableGetAuth=false] - Disable authentication for get routes.
	 * @param {boolean} [options.disableMetasAuth=false] - Disable authentication for metadata routes.
	 * @param {Function[]} [options.globalMiddleware=[]] - Middleware to apply to all routes.
	 * @param {Object.<string, Function[]>} [options.routeMiddleware={}] - Middleware for specific routes.
	 * @param {boolean} [options.enableBulkOperations=false] - Enable bulk create/update/delete routes.
	 * @param {boolean} [options.enableSoftDelete=false] - Enable soft delete functionality.
	 * @param {boolean} [options.enableVersioning=false] - Enable versioning for updates.
	 * @param {string[]} [options.customRoutes=[]] - Additional custom routes to enable.
	 * @throws {Error} If required parameters are missing or invalid.
	 */
	static prepareCrUDAGRoutes(modelOrController, router, options = {}) {
		// Validate parameters
		if(!router || typeof router !== 'function' || typeof router.get !== 'function') {
			throw new Error('A valid Express router is required.');
		}
		if(!modelOrController) {
			throw new Error('Model is required to prepare routes.');
		}

		// Default options
		options = {
			disableAuth: false,
			disableCreateAuth: false,
			disableUpdateAuth: false,
			disableDeleteAuth: false,
			disableAllAuth: false,
			disableGetAuth: false,
			disableMetasAuth: false,
			globalMiddleware: [],
			routeMiddleware: {},
			enableBulkOperations: false,
			enableSoftDelete: false,
			enableVersioning: false,
			customRoutes: [],
			...options,
		};

		// Create controller instance
		const controller = typeof modelOrController === 'string'
			? new Controller(modelOrController)
			: modelOrController;

		// Get model name for logging
		const modelName = typeof modelOrController === 'string'
			? modelOrController
			: controller.constructor.name.replace('Controller', '');

		// Setup authentication middleware
		const bypassMiddleware = (req, res, next) => next();
		const createAuth = options.disableAuth || options.disableCreateAuth ? bypassMiddleware : auth;
		const updateAuth = options.disableAuth || options.disableUpdateAuth ? bypassMiddleware : auth;
		const deleteAuth = options.disableAuth || options.disableDeleteAuth ? bypassMiddleware : auth;
		const allAuth = options.disableAuth || options.disableAllAuth ? bypassMiddleware : auth;
		const getAuth = options.disableAuth || options.disableGetAuth ? bypassMiddleware : auth;
		const metasAuth = options.disableAuth || options.disableMetasAuth ? bypassMiddleware : auth;

		// Helper function to apply middleware chain
		const applyMiddleware = (route, defaultAuth) => {
			const chain = [];

			// Add global middleware
			if(options.globalMiddleware.length > 0) {
				chain.push(...options.globalMiddleware);
			}

			// Add authentication middleware
			chain.push(defaultAuth);

			// Add route-specific middleware
			if(options.routeMiddleware[route] && Array.isArray(options.routeMiddleware[route])) {
				chain.push(...options.routeMiddleware[route]);
			}

			return chain;
		};

		// Setup routes with appropriate middleware chains
		const setupRoute = (method, path, handler, defaultAuth) => {
			const route = `${ method }:${ path }`;
			const middleware = applyMiddleware(route, defaultAuth);
			router[method](path, ...middleware, handler.bind(controller));

			// Log route registration for debugging
			logger.debug(
				chalk.bgBlue.white(' 🚀 ROUTE '),
				`Registered ${ chalk.green(method.toUpperCase()) } ${ chalk.yellow(path) } for ${ chalk.cyan(modelName) }`,
			);
		};

		// Register health check route
		setupRoute('get', '/crudag', (req, res) => res.status(200).send('OK'), bypassMiddleware);

		// Register standard CRUD routes
		setupRoute('post', '/', controller.create, createAuth);
		setupRoute('put', '/:id', controller.update, updateAuth);
		setupRoute('delete', '/:id', controller.delete, deleteAuth);
		setupRoute('get', '/', controller.all, allAuth);
		setupRoute('get', '/:id', controller.get, getAuth);
		setupRoute('put', '/:id/metas', controller.updateMetas, metasAuth);

		// Add bulk operation routes if enabled
		if(options.enableBulkOperations) {
			// Bulk create
			setupRoute('post', '/bulk', controller.bulkCreate || this._generateBulkCreateHandler(controller), createAuth);

			// Bulk update
			setupRoute('put', '/bulk', controller.bulkUpdate || this._generateBulkUpdateHandler(controller), updateAuth);

			// Bulk delete
			setupRoute('delete', '/bulk', controller.bulkDelete || this._generateBulkDeleteHandler(controller), deleteAuth);
		}

		// Add soft delete routes if enabled
		if(options.enableSoftDelete) {
			// Soft delete
			setupRoute('put', '/:id/soft-delete', controller.softDelete || this._generateSoftDeleteHandler(controller), deleteAuth);

			// Restore
			setupRoute('put', '/:id/restore', controller.restore || this._generateRestoreHandler(controller), updateAuth);

			// List deleted items
			setupRoute('get', '/deleted', controller.getDeleted || this._generateGetDeletedHandler(controller), allAuth);
		}

		// Add versioning routes if enabled
		if(options.enableVersioning) {
			// Get versions
			setupRoute('get', '/:id/versions', controller.getVersions || this._generateGetVersionsHandler(controller), getAuth);

			// Revert to version
			setupRoute('put', '/:id/revert/:versionId', controller.revertToVersion || this._generateRevertHandler(controller), updateAuth);
		}

		// Register custom routes
		options.customRoutes.forEach(route => {
			if(!route.method || !route.path || !route.handler) {
				logger.warn(chalk.bgYellow.black(' ⚠️ WARNING '), `Invalid custom route configuration: ${ JSON.stringify(route) }`);
				return;
			}

			const method = route.method.toLowerCase();
			if(![ 'get', 'post', 'put', 'delete', 'patch' ].includes(method)) {
				logger.warn(chalk.bgYellow.black(' ⚠️ WARNING '), `Invalid HTTP method for custom route: ${ route.method }`);
				return;
			}

			const auth = route.auth === false ? bypassMiddleware : (route.auth || auth);
			setupRoute(method, route.path, route.handler, auth);
		});

		logger.info(
			chalk.bgGreen.black(' ✓ ROUTES '),
			`Registered CRUD routes for ${ chalk.cyan(modelName) }`,
		);
	}

	/**
	 * Generates a handler for bulk create operations.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for bulk create.
	 */
	static _generateBulkCreateHandler(controller) {
		return async (req, res) => {
			try {
				if(!Array.isArray(req.body)) {
					return res.status(400).json({ error: 'Request body must be an array for bulk create.' });
				}

				const results = [];
				const errors = [];

				for(let i = 0; i < req.body.length; i++) {
					try {
						const item = req.body[i];
						const result = await controller.model.create(item, req.options || {});
						results.push(result);
					} catch(error) {
						errors.push({ index: i, error: error.message });
					}
				}

				return res.status(207).json({ results, errors });
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for bulk update operations.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for bulk update.
	 */
	static _generateBulkUpdateHandler(controller) {
		return async (req, res) => {
			try {
				if(!Array.isArray(req.body)) {
					return res.status(400).json({ error: 'Request body must be an array for bulk update.' });
				}

				const results = [];
				const errors = [];

				for(let i = 0; i < req.body.length; i++) {
					try {
						const item = req.body[i];

						if(!item.id) {
							errors.push({ index: i, error: 'ID is required for each item in bulk update.' });
							continue;
						}

						const result = await controller.model.update(item.id, item, req.options || {});
						results.push(result);
					} catch(error) {
						errors.push({ index: i, error: error.message });
					}
				}

				return res.status(207).json({ results, errors });
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for bulk delete operations.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for bulk delete.
	 */
	static _generateBulkDeleteHandler(controller) {
		return async (req, res) => {
			try {
				if(!Array.isArray(req.body) && !req.body.ids) {
					return res.status(400)
						.json({ error: 'Request body must be an array of IDs or contain an "ids" array property.' });
				}

				const idsToDelete = Array.isArray(req.body) ? req.body : req.body.ids;

				if(!Array.isArray(idsToDelete)) {
					return res.status(400).json({ error: 'IDs must be provided as an array.' });
				}

				const results = [];
				const errors = [];

				for(let i = 0; i < idsToDelete.length; i++) {
					try {
						const id = idsToDelete[i];
						const result = await controller.model.delete(id, req.options || {});
						results.push({ id, success: true });
					} catch(error) {
						errors.push({ id: idsToDelete[i], error: error.message });
					}
				}

				return res.status(207).json({ results, errors });
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for soft delete operations.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for soft delete.
	 */
	static _generateSoftDeleteHandler(controller) {
		return async (req, res) => {
			try {
				const id = req.params.id;

				if(!id) {
					return res.status(400).json({ error: 'ID is required for soft delete.' });
				}

				const result = await controller.model.update(id, { deletedAt: new Date() }, req.options || {});
				return res.status(200).json(result);
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for restore operations (undoing soft deletes).
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for restore.
	 */
	static _generateRestoreHandler(controller) {
		return async (req, res) => {
			try {
				const id = req.params.id;

				if(!id) {
					return res.status(400).json({ error: 'ID is required for restore.' });
				}

				const result = await controller.model.update(id, { deletedAt: null }, req.options || {});
				return res.status(200).json(result);
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for fetching deleted items.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for getting deleted items.
	 */
	static _generateGetDeletedHandler(controller) {
		return async (req, res) => {
			try {
				const query = { ...req.query, includeDeleted: true };

				// Add filter for deleted items
				const options = {
					...req.options,
					where: {
						...req.options?.where,
						deletedAt: { not: null },
					},
				};

				const result = await controller.model.all(query, options);
				return res.status(200).json(result);
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for getting version history.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for getting versions.
	 */
	static _generateGetVersionsHandler(controller) {
		return async (req, res) => {
			try {
				const id = req.params.id;

				if(!id) {
					return res.status(400).json({ error: 'ID is required to get versions.' });
				}

				// This is a placeholder - actual implementation would depend on
				// how you store versions in your database
				const versions = await PrimateService.prisma.version.findMany({
					where: {
						modelName: controller.modelName,
						recordId: isNaN(parseInt(id)) ? id : parseInt(id),
					},
					orderBy: { createdAt: 'desc' },
				});

				return res.status(200).json(versions);
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Generates a handler for reverting to a previous version.
	 *
	 * @private
	 * @param {Object} controller - The controller instance.
	 * @returns {Function} Express route handler for reverting to a version.
	 */
	static _generateRevertHandler(controller) {
		return async (req, res) => {
			try {
				const id = req.params.id;
				const versionId = req.params.versionId;

				if(!id) {
					return res.status(400).json({ error: 'Record ID is required to revert.' });
				}

				if(!versionId) {
					return res.status(400).json({ error: 'Version ID is required to revert.' });
				}

				// This is a placeholder - actual implementation would depend on
				// how you store versions in your database
				const version = await PrimateService.prisma.version.findUnique({
					where: { id: parseInt(versionId) },
				});

				if(!version) {
					return res.status(404).json({ error: 'Version not found.' });
				}

				// Apply the version data to the current record
				const result = await controller.model.update(id, version.data, req.options || {});

				return res.status(200).json(result);
			} catch(error) {
				return res.status(500).json({ error: error.message });
			}
		};
	}

	/**
	 * Updates the metadata for a record in the database.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record to update.
	 * @param {Object} metas - The new metadata to update.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {boolean} [options.replace=false] - Whether to replace the entire metas object.
	 * @param {string[]} [options.removeKeys=[]] - Keys to remove from the metas object.
	 * @param {Function} [options.validateMetas] - Function to validate metadata before update.
	 * @param {boolean} [options.createIfMissing=false] - Create metas field if it doesn't exist.
	 * @param {Object} [options.defaultMetas={}] - Default metadata to use if metas field doesn't exist.
	 * @returns {Promise<T>} The updated record.
	 * @throws {Error} If any error occurs during the update.
	 */
	static async updateMetas(model, id, metas, options = {}) {
		// Validate parameters
		if(!id) {
			throw new Error('ID is required to update metadata.');
		}
		if(!metas || typeof metas !== 'object') {
			throw new Error('The "metas" parameter must be a non-empty object.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		// Default options
		const {
			replace = false,
			removeKeys = [],
			validateMetas = null,
			createIfMissing = false,
			defaultMetas = {},
		} = options;

		// Create context for hooks
		let context = { model, id, metas, options };

		try {
			// Run beforeUpdateMetas hooks
			if(this.hooks && this.hooks.beforeUpdateMetas) {
				context = await this.runHooks('beforeUpdateMetas', context);
				// Update variables from potentially modified context
				metas = context.metas;
			}

			// Convert the first letter of model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			// Check if the model has a metas field
			const modelFields = PrimateService.getORMObject(model);
			if(!modelFields.hasOwnProperty('metas') && !createIfMissing) {
				throw new Error(`Model "${ model }" does not have a "metas" field.`);
			}

			// Validate metas if a validation function is provided
			if(validateMetas) {
				const validationResult = await validateMetas(metas, model, id);
				if(validationResult !== true) {
					throw new Error(`Metadata validation failed: ${ validationResult }`);
				}
			}

			// Get the current record
			const record = await PrimateService.prisma[model].findUnique({
				where: PrimateService.resolveWhere(model, id),
				select: { id: true, metas: true },
			});

			if(!record) {
				throw new Error(`${ model } with ID ${ id } not found.`);
			}

			// Prepare the updated metas
			let updatedMetas;

			if(replace) {
				// Replace the entire metas object
				updatedMetas = { ...metas };
			} else {
				// Initialize with current metas or default
				const currentMetas = record.metas || defaultMetas;

				// Merge the current metas with the new metas
				updatedMetas = { ...currentMetas, ...metas };

				// Remove keys if specified
				if(removeKeys.length > 0) {
					removeKeys.forEach(key => {
						delete updatedMetas[key];
					});
				}
			}

			// Validate data types to ensure compatibility with JSON storage
			this._validateMetasTypes(updatedMetas);

			// Update the record
			const updatedRecord = await PrimateService.prisma[model].update({
				where: PrimateService.resolveWhere(model, id),
				data: { metas: updatedMetas },
			});

			// Run afterUpdateMetas hooks
			if(this.hooks && this.hooks.afterUpdateMetas) {
				const updatedContext = await this.runHooks('afterUpdateMetas', {
					...context,
					record: updatedRecord,
					previousMetas: record.metas,
					updatedMetas,
				});
				return updatedContext.record;
			}

			return updatedRecord;
		} catch(error) {
			logger.error(`Error updating metadata for ${ model } with ID ${ id }:`, error);

			// Run errorUpdateMetas hooks
			if(this.hooks && this.hooks.errorUpdateMetas) {
				await this.runHooks('errorUpdateMetas', { ...context, error });
			}

			throw new Error(`Error updating metadata: ${ error.message }`);
		}
	}

	/**
	 * Validates that all metadata values are of types compatible with JSON storage.
	 *
	 * @private
	 * @param {Object} metas - The metadata object to validate.
	 * @throws {Error} If any metadata value has an incompatible type.
	 */
	static _validateMetasTypes(metas) {
		const validateNestedObject = (obj, path = '') => {
			for(const [ key, value ] of Object.entries(obj)) {
				const currentPath = path ? `${ path }.${ key }` : key;

				if(value === null) {
					continue;
				} else if(value instanceof Date) {
					// Convert dates to ISO strings for JSON compatibility
					obj[key] = value.toISOString();
				} else if(typeof value === 'function') {
					throw new Error(`Metadata cannot contain functions: ${ currentPath }`);
				} else if(typeof value === 'symbol') {
					throw new Error(`Metadata cannot contain symbols: ${ currentPath }`);
				} else if(typeof value === 'undefined') {
					// Remove undefined values as they're not valid in JSON
					delete obj[key];
				} else if(typeof value === 'object') {
					if(Array.isArray(value)) {
						// Validate array items
						value.forEach((item, index) => {
							if(item === null) {
								return;
							} else if(typeof item === 'object' && !Array.isArray(item)) {
								validateNestedObject(item, `${ currentPath }[${ index }]`);
							} else if(typeof item === 'function' || typeof item === 'symbol' || typeof item === 'undefined') {
								throw new Error(`Metadata array cannot contain ${ typeof item }: ${ currentPath }[${ index }]`);
							}
						});
					} else {
						// Recursively validate nested objects
						validateNestedObject(value, currentPath);
					}
				}
			}
		};

		validateNestedObject(metas);
	}

	/**
	 * Retrieves metadata for a record in the database.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record.
	 * @param {string|string[]} [keys] - Specific metadata keys to retrieve.
	 * @param {Object} [options={}] - Optional parameters.
	 * @returns {Promise<Object>} The requested metadata.
	 * @throws {Error} If any error occurs during retrieval.
	 */
	static async getMetas(model, id, keys = null, options = {}) {
		// Validate parameters
		if(!id) {
			throw new Error('ID is required to get metadata.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		try {
			// Convert the first letter of model to lowercase
			model = model[0].toLowerCase() + model.slice(1);

			// Get the record
			const record = await PrimateService.prisma[model].findUnique({
				where: PrimateService.resolveWhere(model, id),
				select: { metas: true },
			});

			if(!record) {
				throw new Error(`${ model } with ID ${ id } not found.`);
			}

			if(!record.metas) {
				return {};
			}

			// Return specific keys if requested
			if(keys) {
				const result = {};
				const keyArray = Array.isArray(keys) ? keys : [ keys ];

				keyArray.forEach(key => {
					if(record.metas.hasOwnProperty(key)) {
						result[key] = record.metas[key];
					}
				});

				return result;
			}

			// Return all metadata
			return record.metas;
		} catch(error) {
			logger.error(`Error retrieving metadata for ${ model } with ID ${ id }:`, error);
			throw new Error(`Error retrieving metadata: ${ error.message }`);
		}
	}

	/**
	 * Resolves the where clause for a given ID and model.
	 *
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {boolean} [options.allowCompositeKeys=false] - Whether to allow composite keys.
	 * @param {string[]} [options.fallbackFields=[]] - Fields to try if ID isn't numeric.
	 * @param {boolean} [options.tryUniqueFields=false] - Try all unique fields in the model.
	 * @param {Function} [options.customResolver] - Custom function to resolve where clause.
	 * @returns {Object} The where clause for querying the database.
	 * @throws {Error} If the model is not found or the ID is invalid.
	 */
	static resolveWhere(model, id, options = {}) {
		// Validate parameters
		if(!id) {
			throw new Error('ID is required to resolve where clause.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		// Default options
		const {
			allowCompositeKeys = false,
			fallbackFields = [],
			tryUniqueFields = false,
			customResolver = null,
		} = options;

		// Convert the first letter of model to lowercase if needed
		const normalizedModel = model[0].toLowerCase() + model.slice(1);

		// Get the model object from ORM
		const modelObject = this.getORMObject(normalizedModel);
		if(!modelObject) {
			throw new Error(`Model "${ normalizedModel }" not found in PrimateService.orm.`);
		}

		// If a custom resolver is provided, use it
		if(customResolver && typeof customResolver === 'function') {
			return customResolver(normalizedModel, id, modelObject);
		}

		// Handle composite keys (e.g., [user_id, product_id])
		if(allowCompositeKeys && typeof id === 'object' && !Array.isArray(id)) {
			const compositeWhere = {};
			let isValid = false;

			// Validate each key in the composite key
			for(const [ key, value ] of Object.entries(id)) {
				if(!modelObject.hasOwnProperty(key)) {
					logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '),
						`Composite key field "${ key }" is not in the model "${ normalizedModel }".`);
					continue;
				}

				compositeWhere[key] = this._resolveValueByType(value, modelObject[key], key);
				isValid = true;
			}

			if(!isValid) {
				throw new Error(`No valid fields found in composite key for model "${ normalizedModel }".`);
			}

			return compositeWhere;
		}

		// Handle standard ID (numeric or string)
		let where = {};

		// First try with standard ID field
		if(!isNaN(parseInt(id, 10))) {
			where = { id: this._resolveValueByType(id, modelObject.id, 'id') };
			return where;
		}

		// If ID is not numeric, try fallback fields
		const fieldsToTry = [ ...fallbackFields ];

		// Add 'uid' as a fallback if it exists in the model
		if(modelObject.hasOwnProperty('uid') && !fieldsToTry.includes('uid')) {
			fieldsToTry.push('uid');
		}

		// Add all unique fields if tryUniqueFields is true
		if(tryUniqueFields) {
			this._addUniqueFieldsToTry(modelObject, fieldsToTry);
		}

		// Try each field in order
		for(const field of fieldsToTry) {
			if(modelObject.hasOwnProperty(field)) {
				where = { [field]: this._resolveValueByType(id, modelObject[field], field) };
				return where;
			}
		}

		// If we get here, no valid fields were found
		throw new Error(
			`Could not resolve where clause for model "${ normalizedModel }". ` +
			`ID "${ id }" is not numeric and no suitable fields (${ fieldsToTry.join(', ') }) were found in the model.`,
		);
	}

	/**
	 * Resolves a value based on the field type.
	 *
	 * @private
	 * @param {any} value - The value to resolve.
	 * @param {string|Object} fieldType - The field type or schema.
	 * @param {string} fieldName - The name of the field.
	 * @returns {any} The resolved value.
	 */
	static _resolveValueByType(value, fieldType, fieldName) {
		// Handle complex field definitions
		if(typeof fieldType === 'object' && fieldType.type) {
			fieldType = fieldType.type;
		}

		// Convert value based on field type
		switch(fieldType) {
			case 'Int':
				const parsedInt = parseInt(value, 10);
				if(isNaN(parsedInt)) {
					throw new Error(`Value "${ value }" cannot be converted to an integer for field "${ fieldName }".`);
				}
				return parsedInt;

			case 'Float':
				const parsedFloat = parseFloat(value);
				if(isNaN(parsedFloat)) {
					throw new Error(`Value "${ value }" cannot be converted to a float for field "${ fieldName }".`);
				}
				return parsedFloat;

			case 'Boolean':
				if(typeof value === 'string') {
					const normalizedValue = value.toLowerCase().trim();
					if([ 'true', 'yes', '1', 'on' ].includes(normalizedValue)) {
						return true;
					}
					if([ 'false', 'no', '0', 'off' ].includes(normalizedValue)) {
						return false;
					}
				}
				return Boolean(value);

			case 'DateTime':
				if(value instanceof Date) {
					return value;
				}
				if(typeof value === 'string') {
					const date = new Date(value);
					if(isNaN(date.getTime())) {
						throw new Error(`Value "${ value }" cannot be converted to a date for field "${ fieldName }".`);
					}
					return date;
				}
				throw new Error(`Value cannot be converted to a date for field "${ fieldName }".`);

			case 'String':
			default:
				return value.toString();
		}
	}

	/**
	 * Adds unique fields to the list of fields to try.
	 *
	 * @private
	 * @param {Object} modelObject - The model object.
	 * @param {string[]} fieldsToTry - The array of fields to try.
	 */
	static _addUniqueFieldsToTry(modelObject, fieldsToTry) {
		// This is a placeholder - actual implementation depends on how your ORM indicates unique fields

		// Example 1: If your ORM uses a 'unique' property
		for(const [ field, schema ] of Object.entries(modelObject)) {
			if(
				typeof schema === 'object' &&
				schema.unique === true &&
				!fieldsToTry.includes(field)
			) {
				fieldsToTry.push(field);
			}
		}

		// Example 2: If your ORM keeps track of unique fields separately
		if(modelObject.uniqueFields && Array.isArray(modelObject.uniqueFields)) {
			for(const field of modelObject.uniqueFields) {
				if(!fieldsToTry.includes(field) && modelObject.hasOwnProperty(field)) {
					fieldsToTry.push(field);
				}
			}
		}

		// Example 3: If your schema includes @unique directive indicators
		for(const [ field, schema ] of Object.entries(modelObject)) {
			if(
				(typeof schema === 'string' && schema.includes('@unique')) ||
				(typeof schema === 'object' && schema.isUnique)
			) {
				if(!fieldsToTry.includes(field)) {
					fieldsToTry.push(field);
				}
			}
		}
	}

	/**
	 * Retrieves the ORM object for a given model.
	 *
	 * @param {string} model - The name of the model.
	 * @returns {Object} The ORM object for the specified model.
	 * @throws {Error} If the model is not found in PrimateService.orm.
	 */
	static getORMObject(model) {
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const ormObject = PrimateService.orm[model];
		if(!ormObject) {
			throw new Error(`Model "${ model }" not found in PrimateService.orm.`);
		}

		return ormObject;
	}

	/**
	 * Resolves the ID for a given model based on its type.
	 *
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record.
	 * @returns {number|string} The resolved ID.
	 * @throws {Error} If the model is not found or the ID type is invalid.
	 */
	static resolveId(model, id) {
		if(!id) {
			throw new Error('ID is required to resolve.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const orm = PrimateService.getORMObject(model);
		if(!orm) {
			throw new Error(`Model "${ model }" not found in PrimateService.orm.`);
		}

		if(orm.id === 'Int') {
			const parsedId = parseInt(id, 10);
			if(isNaN(parsedId)) {
				throw new Error(`ID "${ id }" is not a valid integer.`);
			}
			return parsedId;
		} else {
			return id;
		}
	}

	/**
	 * Finds a unique record in the database based on the provided criteria.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {Object} where - The criteria to find the record.
	 * @param {Object} [params={}] - Optional parameters.
	 * @returns {Promise<T|null>} The found record, or null if no record is found.
	 * @throws {Error} If any error occurs during the query.
	 */
	static async findBy(model, where, params = {}) {
		if(!where || typeof where !== 'object') throw new Error('The "where" parameter must be a non-empty object.');
		if(!model || typeof model !== 'string') throw new Error('The "model" parameter must be a non-empty string.');

		try {
			return await PrimateService.prisma[model].findFirst({
				where,
				...params,
			});
		} catch(e) {
			logger.error(`Error finding ${ model } with criteria ${ JSON.stringify(where) }:`, e);
			throw new Error(`Error finding ${ model }: ${ e.message }`);
		}
	}

	/**
	 * Finds a record by its ID or UID in the specified model.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record.
	 * @returns {Promise<T|null>} The found record, or null if no record is found.
	 * @throws {Error} If the model is not found or an error occurs during the query.
	 */
	static async findById(model, id) {
		if(!id) {
			throw new Error('ID is required to find a record.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const ormObject = PrimateService.getORMObject(model);
		if(!ormObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		try {
			return await PrimateService.prisma[model].findUnique({
				where: PrimateService.resolveWhere(model, id),
			});
		} catch(e) {
			logger.error(`Error finding ${ model } with ID ${ id }:`, e);
			throw new Error(`Error finding ${ model }: ${ e.message }`);
		}
	}
}

export default PrimateService;