import slugify from 'slugify';
import chalk from 'chalk';
import * as changeCase from 'change-case';
import createError from 'http-errors';

import auth from '../middlewares/auth.js';
import Controller from './controller.js';
import Primate from './primate.js';
import config from '../utils/config.js';

/**
 * @typedef {Object} ServiceOptions
 * @property {Function} [filterCreateData] - Function to filter create data
 * @property {Function} [filterUpdateData] - Function to filter update data
 * @property {Function} [filterResultData] - Function to filter result data
 * @property {Function} [filterAllQuery] - Function to filter query object
 * @property {Object} [upsertRules] - Rules for upsert operations
 * @property {string[]} [queryableFields] - Fields that can be searched
 * @property {Object} [include] - Default relations to include
 * @property {Object} [where] - Additional where conditions
 * @property {string} [searchField] - Field to search when ID is not numeric
 * @property {Function} [resolveWhere] - Custom where clause resolver
 * @property {number} [idUser] - Current user ID
 */

/**
 * Enhanced generic service class for handling CRUD operations with better
 * error handling, validation, hooks, and performance optimizations.
 */
class PrimateService {

	static prisma = null;
	static orm = null;
	static cache = new Map(); // Simple in-memory cache

	static hooks = {
		beforeCreate: [],
		afterCreate: [],
		beforeUpdate: [],
		afterUpdate: [],
		beforeDelete: [],
		afterDelete: [],
		beforeAll: [],
		afterAll: [],
		beforeGet: [],
		afterGet: [],
	};

	/**
	 * Initialize service with Prisma instance and ORM
	 */
	static initialize(prismaInstance, orm) {
		if(!prismaInstance) throw new Error('Prisma instance is required for PrimateService initialization');
		if(!orm) throw new Error('ORM object is required for PrimateService initialization');

		PrimateService.prisma = prismaInstance;
		PrimateService.orm = orm;
		console.info(chalk.green('✅  PrimateService initialized successfully'));
	}

	/**
	 * Add a hook for specific events
	 * @param {string} event - The event name (beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete, beforeAll, afterAll, beforeGet, afterGet)
	 * @param {Function} fn - The function to be executed when the event is triggered
	 * @throws {Error} If the event is invalid or the function is not a function
	 * @returns {void}
	 */
	static addHook(event, fn) {
		if(!this.hooks[event]) {
			throw new Error(`Invalid hook event: ${ event }. Valid events: ${ Object.keys(this.hooks).join(', ') }`);
		}
		if(typeof fn !== 'function') {
			throw new Error('Hook must be a function');
		}
		this.hooks[event].push(fn);
	}

	/**
	 * Remove a hook
	 * @param {string} event - The event name
	 * @param {Function} fn - The function to be removed
	 * @returns {boolean} True if the hook was removed, false otherwise
	 * @throws {Error} If the event is invalid
	 */
	static removeHook(event, fn) {
		if(!this.hooks[event]) return false;
		const index = this.hooks[event].indexOf(fn);
		if(index > -1) {
			this.hooks[event].splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Run hooks for a specific event
	 * @param {string} event - The event name
	 * @param {Object} context - The context object to be passed to the hooks
	 * @returns {Promise<void>}
	 * @throws {Error} If the event is invalid or an error occurs during hook execution
	 */
	static async runHooks(event, context) {
		if(!this.hooks[event] || this.hooks[event].length === 0) return;

		for(const hook of this.hooks[event]) {
			try {
				await hook(context);
			} catch(error) {
				console.error(`Hook error in ${ event }:`, error);
				throw new Error(`Hook execution failed: ${ error.message }`);
			}
		}
	}

	/**
	 * Validate model exists in ORM
	 * @private
	 * @param {string} model - The name of the model
	 * @returns {string} The normalized model name
	 * @throws {Error} If the model is invalid or not found in ORM
	 * @throws {Error} If the model is not a string
	 * @throws {Error} If the model is not found in ORM
	 */
	static _validateModel(model) {
		if(!model || typeof model !== 'string') {
			throw createError.BadRequest('Model name is required and must be a string');
		}

		const normalizedModel = model[0].toLowerCase() + model.slice(1);
		if(!this.orm[normalizedModel]) {
			throw createError.NotFound(`Model "${ normalizedModel }" not found in ORM`);
		}

		return normalizedModel;
	}

	/**
	 * Enhanced data validation with schema support
	 * @private
	 * @param {string} model - The name of the model
	 * @param {Object} data - The data to be validated
	 * @param {string} [operation='create'] - The operation type (create, update)
	 * @returns {Promise<Object>} The validated data
	 * @throws {Error} If the data is invalid or validation fails
	 */
	static async _validateData(model, data, operation = 'create') {
		if(!data || typeof data !== 'object') {
			throw createError.BadRequest('Data must be a valid object');
		}

		try {
			// Use Primate's schema validation if available
			return await Primate.validateSchema(model, data);
		} catch(error) {
			throw createError.BadRequest(`Validation failed: ${ error.message }`);
		}
	}

	/**
	 * Process relations for create/update operations
	 * @private
	 * @param {string} model - The name of the model
	 * @param {Object} data - The data to be processed
	 * @param {Object} modelFields - The fields of the model
	 * @returns {Object} The processed data with relations
	 * @throws {Error} If the model is invalid or if there are issues with relations
	 */
	static _processRelations(model, data, modelFields) {
		const relations = modelFields.relations;
		if(!relations) return data;

		const processedData = { ...data };

		for(const [ relation, relationData ] of Object.entries(relations)) {
			// Handle one-to-many relations
			if(relationData.type === 'one-to-many' && processedData[relationData.field]) {
				processedData[relationData.model] = {
					connect: { id: parseInt(processedData[relationData.field], 10) },
				};
				delete processedData[relationData.field];
			}

			// Handle many-to-many relations
			if(relationData.type === 'many-to-many' && processedData[relationData.plural]) {
				const relationArray = processedData[relationData.plural];
				if(Array.isArray(relationArray)) {
					processedData[relationData.plural] = {
						connect: relationArray.map(item =>
							typeof item === 'object' && item.hasOwnProperty('id')
								? { id: parseInt(item.id, 10) }
								: { id: parseInt(item, 10) },
						),
					};
				}
			}
		}

		return processedData;
	}

	/**
	 * Process many-to-many relation updates
	 * @private
	 * @param {string} model - The name of the model
	 * @param {number|string} id - The ID of the record
	 * @param {Object} relationData - The relation data
	 * @param {Object} data - The data to be processed
	 * @returns {Promise<Object>} The processed data with updated relations
	 * @throws {Error} If the model is invalid or if there are issues with relations
	 */
	static async _processManyToManyUpdate(model, id, relationData, data) {
		const relationKey = relationData.plural;
		const relationArray = data[relationKey];

		if(!Array.isArray(relationArray)) return data;

		// Get current relations
		const currentEntity = await this.prisma[model].findUnique({
			where: { id: parseInt(id, 10) },
			select: { [relationKey]: true },
		});

		if(!currentEntity) return data;

		const currentRelations = currentEntity[relationKey] || [];
		const newRelations = relationArray.map(item =>
			typeof item === 'object' && item.hasOwnProperty('id')
				? parseInt(item.id, 10)
				: parseInt(item, 10),
		);

		// Find relations to disconnect
		const toDisconnect = currentRelations
			.filter(current => !newRelations.includes(current.id))
			.map(item => ({ id: item.id }));

		// Build relation update object
		const relationUpdate = {
			connect: newRelations.map(id => ({ id })),
		};

		if(toDisconnect.length > 0) {
			relationUpdate.disconnect = toDisconnect;
		}

		data[relationKey] = relationUpdate;
		return data;
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
		const normalizedModel = this._validateModel(model);

		// Validate and prepare data
		const validatedData = await this._validateData(normalizedModel, data, 'create');

		const context = { model: normalizedModel, data: validatedData, options };
		await this.runHooks('beforeCreate', context);

		try {

			let processedData = validatedData;

			// Apply data filter if provided
			if(options.filterCreateData) processedData = await options.filterCreateData(processedData, normalizedModel, options);

			// Get model fields and process relations
			const modelFields = this.getORMObject(normalizedModel);
			processedData = this._processRelations(normalizedModel, processedData, modelFields);

			// Sanitize data to avoid errors
			data = this.sanitizeData(model, data);

			// Handle upsert rules
			if(options.upsertRules) {
				for(const [ field, rule ] of Object.entries(options.upsertRules)) {
					if(rule.slugify && processedData[rule.slugify]) {
						processedData[field] = slugify(processedData[rule.slugify], { lower: true });
					}
				}
			}

			// Sanitize and create record
			processedData = this.sanitizeData(normalizedModel, processedData);
			const record = await this.prisma[normalizedModel].create({ data: processedData });

			await this.runHooks('afterCreate', { ...context, record });

			return record;

		} catch(error) {
			console.error(`Error creating ${ normalizedModel }:`, error);

			// Handle specific Prisma errors
			if(error.code === 'P2002') {
				throw createError.Conflict(`${ model } with this data already exists`);
			}
			if(error.code === 'P2003') {
				throw createError.BadRequest('Foreign key constraint failed');
			}

			throw createError.InternalServerError(`Failed to create ${ model }: ${ error.message }`);
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
		const normalizedModel = this._validateModel(model);
		if(!id) throw createError.BadRequest('ID is required for update operation');

		const context = { model: normalizedModel, id, data, options };
		await this.runHooks('beforeUpdate', context);

		try {

			let processedData = { ...data };

			// Apply data filter if provided
			if(options.filterUpdateData) {
				processedData = await options.filterUpdateData(processedData, normalizedModel, options);
			}

			// Get model fields and process relations
			const modelFields = this.orm[normalizedModel];
			const relations = modelFields.relations;

			if(relations) {
				for(const [ relation, relationData ] of Object.entries(relations)) {
					// Handle one-to-many relations
					if(relationData.type === 'one-to-many' && processedData[relationData.field]) {
						processedData[relationData.model] = {
							connect: { id: parseInt(processedData[relationData.field], 10) },
						};
						delete processedData[relationData.field];
					}

					// Handle many-to-many relations with disconnect logic
					if(relationData.type === 'many-to-many' && processedData[relationData.plural]) {
						processedData = await this._processManyToManyUpdate(
							normalizedModel, id, relationData, processedData,
						);
					}
				}
			}

			// Sanitize data and build where clause
			processedData = this.sanitizeData(normalizedModel, processedData);
			const where = this._buildWhereClause(normalizedModel, id, options);

			const record = await this.prisma[normalizedModel].update({ where, data: processedData });

			await this.runHooks('afterUpdate', { ...context, record });
			return record;

		} catch(error) {
			console.error(`Error updating ${ normalizedModel }:`, error);

			if(error.code === 'P2025') {
				throw createError.NotFound(`${ model } not found`);
			}
			if(error.code === 'P2002') {
				throw createError.Conflict(`${ model } with this data already exists`);
			}

			throw createError.InternalServerError(`Failed to update ${ model }: ${ error.message }`);
		}
	}

	// Delete ----------------------------------------------------------------------------------------------------------
	/**
	 * Deletes a record by its ID from the specified model.
	 *
	 * @template T
	 * @param {number|string} id - The ID of the record to delete.
	 * @param {string} model - The name of the model.
	 * @returns {Promise<T>} The deleted record.
	 * @throws {Error} If any required parameter is missing or an error occurs during deletion.
	 */
	static async delete(model, id) {
		const normalizedModel = this._validateModel(model);
		if(!id) throw createError.BadRequest('ID is required for delete operation');

		const context = { model: normalizedModel, id };
		await this.runHooks('beforeDelete', context);

		try {
			const where = this.resolveWhere(normalizedModel, id);
			const record = await this.prisma[normalizedModel].delete({ where });

			await this.runHooks('afterDelete', { ...context, record });
			return record;

		} catch(error) {
			console.error(`Error deleting ${ normalizedModel }:`, error);

			if(error.code === 'P2025') {
				throw createError.NotFound(`${ model } not found`);
			}
			if(error.code === 'P2003') {
				throw createError.BadRequest('Cannot delete: record is referenced by other records');
			}

			throw createError.InternalServerError(`Failed to delete ${ model }: ${ error.message }`);
		}
	}

	// All -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a list of records from the specified model based on query parameters.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {Object} query - The query parameters.
	 * @param {Object} [options={}] - Optional parameters.
	 * @returns {Promise<{[T], number}>} The list of records and the total count.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async all(model, query = {}, options = {}) {
		const normalizedModel = this._validateModel(model);

		const context = { model: normalizedModel, query, options };
		await this.runHooks('beforeAll', context);

		// Generate cache key
		const cacheKey = `${ normalizedModel }:all:${ JSON.stringify({ query, options }) }`;

		// Check cache first (if enabled)
		if(config.cache?.enabled && this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey);
		}

		try {
			// Extract and validate pagination parameters
			const {
				page = 1,
				limit = Math.min(query.limit || config.api.pagination.defaultLimit, config.api.pagination.maxLimit),
				by = config.api.pagination.defaultSortBy,
				order = config.api.pagination.defaultSortOrder,
				q,
				count: countOnly,
				select,
			} = query;

			// Build base query object
			let queryObject = {
				where: {},
				orderBy: { [by]: order },
			};

			// Handle search query
			if(q && options.queryableFields) {
				queryObject.where.OR = this._buildSearchQuery(normalizedModel, q, options.queryableFields);
			}

			// Handle field-specific filters
			queryObject.where = this._buildFieldFilters(normalizedModel, query, queryObject.where);

			// Merge additional where conditions
			if(options.where) queryObject.where = { ...queryObject.where, ...options.where };

			// Allow query customization
			if(options.filterAllQuery) {
				queryObject = await options.filterAllQuery(query, queryObject, options) || queryObject;
			}

			// Count total records
			const totalCount = await this.prisma[normalizedModel].count({ where: queryObject.where });

			// Return count only if requested
			if(countOnly) return { data: [], count: totalCount };

			// Build final query arguments
			const args = {
				...queryObject,
				skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
				take: parseInt(limit, 10),
			};

			/// Handle select fields
			if(select) {
				args.select = this._buildSelectObject(normalizedModel, select);
			}

			// Handle includes and fetches
			args.include = this._buildIncludeObject(normalizedModel, query, options);

			// Execute query
			let data = await this.prisma[normalizedModel].findMany(args);

			// Apply result filter if provided
			if(options.filterResultData) {
				data = await options.filterResultData(data, query);
			}

			const result = { data, count: totalCount };

			// Cache result if enabled
			if(config.cache?.enabled) {
				this.cache.set(cacheKey, result);
				// Simple TTL - delete after 5 minutes
				setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
			}

			await this.runHooks('afterAll', { ...context, data });
			return result;

		} catch(error) {
			console.error(`Error retrieving ${ normalizedModel }:`, error);
			throw createError.InternalServerError(`Failed to retrieve ${ model }: ${ error.message }`);
		}
	}

	// Get -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a record from the database based on the given ID and model.
	 *
	 * @template T
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record to retrieve.
	 * @param {Object} [query={}] - The query parameters.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.resolveWhere] - Function to resolve the where clause.
	 * @param {string[]} [options.searchField] - Fields to search if ID is not a number.
	 * @param {Function} [options.filterGetItem] - Function to filter the retrieved item.
	 * @returns {Promise<T>} The retrieved record.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async get(model, id, query = {}, options = {}) {
		const normalizedModel = this._validateModel(model);

		if(!id) throw createError.BadRequest('ID is required for get operation');

		const context = { model: normalizedModel, id, query, options };
		await this.runHooks('beforeGet', context);

		try {

			const args = {
				where: this._buildWhereClause(normalizedModel, id, options),
			};

			// Handle includes and fetches
			args.include = this._buildIncludeObject(normalizedModel, query, options);

			let record = await this.prisma[normalizedModel].findFirst(args);

			// Apply result filter if provided
			if(options.filterGetItem && record) {
				record = await options.filterGetItem(record, query);
			}

			await this.runHooks('afterGet', { ...context, record });
			return record;

		} catch(error) {
			console.error(`Error retrieving ${ normalizedModel } with ID ${ id }:`, error);
			throw createError.InternalServerError(`Failed to retrieve ${ model }: ${ error.message }`);
		}
	}

	// Other functions -------------------------------------------------------------------------------------------------
	/**
	 * Sanitizes the data by removing fields that are not in the model.
	 *
	 * @param {string} model - The name of the model.
	 * @param {Object} data - The data to be sanitized.
	 * @returns {Object} The sanitized data.
	 * @throws {Error} If the model is not found or the parameters are invalid.
	 */
	static sanitizeData(model, data) {
		// Validate parameters
		if(!data || typeof data !== 'object') {
			throw createError.BadRequest('Data must be a valid object');
		}
		const normalizedModel = this._validateModel(model);
		const modelObject = this.orm[normalizedModel];
		const sanitized = {};

		// Only include fields that exist in the model
		Object.entries(data).forEach(([ field, value ]) => {
			if(modelObject.hasOwnProperty(field) || field === 'metas') {
				sanitized[field] = value;
			} else {
				console.warn(
					chalk.bgYellow.black.italic(' ⚠️ WARNING '),
					`Field "${ field }" not found in model "${ normalizedModel }"`,
				);
			}
		});

		return sanitized;
	}

	/**
	 * Prepares CRUD and additional routes for a given model.
	 *
	 * @param {string|Object} modelOrController - The model name or an instance of a model controller.
	 * @param {Express.Router} router - The Express router.
	 * @param options - Optional parameters.
	 * @param {boolean|Function} [options.disableCreateAuth] - Disable authentication for create route.
	 * @param {boolean|Function} [options.disableUpdateAuth] - Disable authentication for update route.
	 * @param {boolean|Function} [options.disableDeleteAuth] - Disable authentication for delete route.
	 * @param {boolean|Function} [options.disableAllAuth] - Disable authentication for all route.
	 * @param {boolean|Function} [options.disableGetAuth] - Disable authentication for get route.
	 * @param {boolean|Function} [options.disableMetasAuth] - Disable authentication for metas update route.
	 * @param {boolean} [options.disableAuth] - Disable authentication for all routes.
	 */
	static prepareCrUDAGRoutes(modelOrController, router, options = {}) {
		if(!router || typeof router !== 'function') {
			throw new Error('Valid Express router is required');
		}
		if(!modelOrController) {
			throw new Error('Model or controller is required');
		}

		const controller = typeof modelOrController === 'string'
			? new Controller(modelOrController, options)
			: modelOrController;

		// Enhanced middleware configuration
		const createMiddleware = (authOption, defaultAuth = auth) => {
			if(options.disableAuth || authOption === false) {
				return (req, res, next) => next();
			}
			if(typeof authOption === 'function') {
				return authOption;
			}
			return defaultAuth;
		};

		const createAuth = createMiddleware(options.disableCreateAuth);
		const updateAuth = createMiddleware(options.disableUpdateAuth);
		const deleteAuth = createMiddleware(options.disableDeleteAuth);
		const allAuth = createMiddleware(options.disableAllAuth);
		const getAuth = createMiddleware(options.disableGetAuth);
		const metasAuth = createMiddleware(options.disableMetasAuth);

		// Setup routes
		router.get('/crudag', (req, res) => res.respond({
			message: 'CRUDAG routes are active',
			model: controller.modelName,
		}));

		router.post('/', createAuth, controller.create.bind(controller));
		router.get('/', allAuth, controller.all.bind(controller));
		router.get('/health', controller.health.bind(controller));
		router.get('/:id', getAuth, controller.get.bind(controller));
		router.put('/:id', updateAuth, controller.update.bind(controller));
		router.delete('/:id', deleteAuth, controller.delete.bind(controller));
		router.put('/:id/metas', metasAuth, controller.updateMetas.bind(controller));

		return router;
	}

	/**
	 * Updates the metadata for a record in the database.
	 *
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record to update.
	 * @param {Object} metas - The new metadata to update.
	 * @returns {Promise<Object>} The updated record.
	 * @throws {Error} If any error occurs during the update.
	 */
	static async updateMetas(model, id, metas) {
		const normalizedModel = this._validateModel(model);

		if(!id) throw createError.BadRequest('ID is required for metadata update');
		if(!metas || typeof metas !== 'object') {
			throw createError.BadRequest('Metadata must be a valid object');
		}

		try {
			// Get current metadata
			const current = await this.prisma[normalizedModel].findUnique({
				where: this.resolveWhere(normalizedModel, id),
				select: { metas: true },
			});

			if(!current) {
				throw createError.NotFound(`${ model } not found`);
			}

			// Merge metadata
			const mergedMetas = { ...current.metas, ...metas };

			// Update record
			return await this.prisma[normalizedModel].update({
				where: this.resolveWhere(normalizedModel, id),
				data: { metas: mergedMetas },
			});

		} catch(error) {
			if(error.status) throw error; // Re-throw HTTP errors
			console.error(`Error updating metadata for ${ normalizedModel }:`, error);
			throw createError.InternalServerError(`Failed to update metadata: ${ error.message }`);
		}
	}

	/**
	 * Resolves the where clause for a given ID and model.
	 *
	 * @param {string} model - The name of the model.
	 * @param {number|string} id - The ID of the record.
	 * @returns {Object} The where clause for querying the database.
	 * @throws {Error} If the model is not found or the ID is invalid.
	 */
	static resolveWhere(model, id) {
		const normalizedModel = this._validateModel(model);

		if(!id) throw createError.BadRequest('ID is required');

		const modelObject = this.orm[normalizedModel];

		// Handle non-numeric IDs (assume UID field)
		if(isNaN(parseInt(id, 10))) {
			if(modelObject.hasOwnProperty('uid')) {
				return { uid: id };
			}
			throw createError.BadRequest(`Model "${ normalizedModel }" does not support non-numeric IDs`);
		}

		return { id: this.resolveId(normalizedModel, id) };
	}

	/**
	 * Retrieves the ORM object for a given model.
	 *
	 * @param {string} model - The name of the model.
	 * @returns {Object} The ORM object for the specified model.
	 * @throws {Error} If the model is not found in PrimateService.orm.
	 */
	static getORMObject(model) {
		const normalizedModel = this._validateModel(model);
		return this.orm[normalizedModel];
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
		const normalizedModel = this._validateModel(model);

		if(!id) throw createError.BadRequest('ID is required');

		const orm = this.getORMObject(normalizedModel);

		if(orm.id === 'Int') {
			const parsedId = parseInt(id, 10);
			if(isNaN(parsedId)) {
				throw createError.BadRequest(`ID "${ id }" is not a valid integer`);
			}
			return parsedId;
		}

		return id;
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
		const normalizedModel = this._validateModel(model);

		if(!where || typeof where !== 'object') {
			throw createError.BadRequest('Where clause must be a valid object');
		}

		try {
			return await this.prisma[normalizedModel].findFirst({ where, ...params });
		} catch(error) {
			console.error(`Error finding ${ normalizedModel }:`, error);
			throw createError.InternalServerError(`Failed to find ${ model }: ${ error.message }`);
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
		const normalizedModel = this._validateModel(model);

		if(!id) throw createError.BadRequest('ID is required');

		try {
			return await this.prisma[normalizedModel].findUnique({
				where: this.resolveWhere(normalizedModel, id),
			});
		} catch(error) {
			console.error(`Error finding ${ normalizedModel } by ID:`, error);
			throw createError.InternalServerError(`Failed to find ${ model }: ${ error.message }`);
		}
	}

	/**
	 * Build search query for full-text search
	 * @private
	 */
	static _buildSearchQuery(model, searchTerm, queryableFields) {
		const modelFields = this.getORMObject(model);
		const orConditions = [];

		// Add ID search if term is numeric
		if(!isNaN(parseInt(searchTerm, 10))) {
			orConditions.push({ id: parseInt(searchTerm, 10) });
		}

		// Build field-specific search conditions
		queryableFields.forEach(field => {
			if(field.includes('.')) {
				// Handle relation fields
				const [ relation, subfield ] = field.split('.');
				if(modelFields.hasOwnProperty(relation)) {
					orConditions.push({
						[relation]: { [subfield]: { contains: searchTerm } },
					});
				}
			} else if(modelFields.hasOwnProperty(field)) {
				// Handle direct fields
				if(modelFields[field] === 'String') {
					orConditions.push({
						[field]: { contains: searchTerm },
					});
				} else if(modelFields[field] === 'Int' && !isNaN(parseInt(searchTerm, 10))) {
					orConditions.push({ [field]: parseInt(searchTerm, 10) });
				}
			}
		});

		return orConditions;
	}

	/**
	 * Build field-specific filters from query parameters
	 * @private
	 */
	static _buildFieldFilters(model, query, existingWhere = {}) {
		const modelFields = this.orm[model];
		const where = { ...existingWhere };

		Object.entries(modelFields).forEach(([ field, fieldType ]) => {
			if(query[field] !== undefined && field !== 'relations') {
				const value = query[field];

				if(typeof value === 'string') {
					// Handle comma-separated values (IN operator)
					if(value.includes(',')) {
						where[field] = { in: value.split(',').map(v => v.trim()) };
					}
					// Handle pipe-separated values (array contains)
					else if(value.includes('|')) {
						where[field] = { has: value.split('|').map(v => v.trim()) };
					}
					// Handle range queries for numbers and dates
					else if(value.includes('..')) {
						const [ min, max ] = value.split('..');
						if(fieldType === 'Int' || fieldType === 'Float') {
							where[field] = {
								gte: parseFloat(min) || undefined,
								lte: parseFloat(max) || undefined,
							};
						} else if(fieldType === 'DateTime') {
							where[field] = {
								gte: new Date(min) || undefined,
								lte: new Date(max) || undefined,
							};
						}
					}
					// Simple equality
					else {
						where[field] = fieldType === 'Int' ? parseInt(value, 10) : value;
					}
				} else {
					where[field] = value;
				}
			}
		});

		return where;
	}

	/**
	 * Build where clause with support for different ID types
	 * @private
	 */
	static _buildWhereClause(model, id, options = {}) {
		if(options.resolveWhere) {
			return options.resolveWhere(model, id);
		}

		const modelFields = this.orm[model];

		// Handle search by alternative field
		if(options.searchField && isNaN(parseInt(id, 10))) {
			const searchFields = Array.isArray(options.searchField)
				? options.searchField
				: [ options.searchField ];

			const searchConditions = searchFields
				.filter(field => modelFields.hasOwnProperty(field))
				.map(field => ({
					[field]: modelFields[field] === 'Int' ? parseInt(id, 10) : id,
				}));

			return searchConditions.length === 1
				? searchConditions[0]
				: { OR: searchConditions };
		}

		return this.resolveWhere(model, id);
	}

	/**
	 * Build select object for field selection
	 * @private
	 */
	static _buildSelectObject(model, selectFields) {
		const modelFields = this.orm[model];
		const select = {};

		const fields = typeof selectFields === 'string'
			? selectFields.split(',').map(f => f.trim())
			: selectFields;

		fields.forEach(field => {
			if(modelFields.hasOwnProperty(field)) {
				select[field] = true;
			} else {
				console.warn(
					chalk.bgYellow.black.italic(' ⚠️ WARNING '),
					`Field "${ field }" not found in model "${ model }"`,
				);
			}
		});

		return select;
	}

	/**
	 * Build include object for relations
	 * @private
	 */
	static _buildIncludeObject(model, query, options) {
		let include = {};

		// Add default includes from options
		if(options.include) {
			include = { ...options.include };
		}

		// Handle query includes
		if(query.include) {
			include = { ...include, ...query.include };
		}

		// Handle fetch-* parameters
		const fetchKeys = Object.keys(query)
			.filter(key => key.startsWith('fetch-'))
			.sort();

		const modelFields = this.orm[model];

		fetchKeys.forEach(fetchKey => {
			const entity = fetchKey.replace('fetch-', '');
			const value = query[fetchKey];
			const entityCamel = changeCase.camelCase(entity);

			if(modelFields.hasOwnProperty(entityCamel)) {
				if(value === '1' || value === 1 || value === true) {
					include[entityCamel] = true;
				} else if(typeof value === 'string') {
					include[entityCamel] = { include: { [value]: true } };
				}
			}
		});

		return Object.keys(include).length > 0 ? include : undefined;
	}
}

export default PrimateService;