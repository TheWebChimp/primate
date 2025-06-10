import createError from 'http-errors';
import fs from 'fs';
import chalk from 'chalk';
import pluralize from 'pluralize';
import * as changeCase from 'change-case';

import primate from './primate.js';
import PrimateService from './service.js';

/**
 * @typedef {Object} ControllerOptions
 * @property {Object} [service] - Custom service instance
 * @property {string[]} [queryableFields] - Fields that can be searched
 * @property {Object} [include] - Default relations to include
 * @property {Function} [filterCreateData] - Function to filter create data
 * @property {Function} [filterUpdateData] - Function to filter update data
 * @property {Function} [filterResultData] - Function to filter result data
 * @property {boolean} [validateInput=true] - Enable input validation
 * @property {boolean} [sanitizeInput=true] - Enable input sanitization
 */

/**
 * Generic controller for handling CRUD operations with enhanced error handling,
 * validation, and async service loading.
 */
export default class PrimateController {

	/**
	 * Creates an instance of PrimateController.
	 *
	 *
	 * @param {string} modelName - The name of the model.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Object} [options.service] - The service to be used, if not provided, it will be dynamically imported.
	 * @param {string[]} [options.queryableFields] - Fields that can be searched.
	 * @param {Object} [options.include] - Default relations to include.
	 * @param {Function} [options.filterCreateData] - Function to filter create data.
	 * @param {Function} [options.filterUpdateData] - Function to filter update data.
	 * @param {Function} [options.filterResultData] - Function to filter result data.
	 * @param {boolean} [options.validateInput=true] - Enable input validation.
	 * @param {boolean} [options.sanitizeInput=true] - Enable input sanitization.
	 * @throws {Error} - Throws an error if the model name is invalid.
	 */
	constructor(modelName, options = {}) {
		if(!modelName || typeof modelName !== 'string') {
			throw new Error('Model name is required and must be a string');
		}

		this.modelName = modelName;
		this.options = { validateInput: true, sanitizeInput: true, ...options };

		// Convert camelCase to kebab-case for file names
		const serviceFileName = modelName.replace(/([A-Z])/g, '-$1').toLowerCase();
		this.singular = serviceFileName.startsWith('-') ? serviceFileName.substring(1) : serviceFileName;
		this.plural = pluralize(this.singular);
		this.entity = changeCase.camelCase(modelName);

		// Service loading state
		this.serviceLoaded = false;
		this.serviceLoadPromise = null;

		// Initialize service
		this._initializeService();
	}

	/**
	 * Initialize service with proper async handling
	 * @private
	 * @returns {void}
	 * @throws {Error} - Throws an error if the service cannot be loaded.
	 */
	_initializeService() {
		if(this.options.service) {
			this.service = this.options.service;
			this.serviceLoaded = true;
		} else {
			this.serviceLoadPromise = this._loadDynamicService();
		}
	}

	/**
	 * Dynamically load service from file system
	 * @private
	 * @returns {Promise<void>}
	 * @throws {Error} - Throws an error if the service file cannot be found or loaded.
	 */
	async _loadDynamicService() {
		if(this.serviceLoaded) return;

		const servicePath = `./entities/${ this.plural }/${ this.singular }.service.js`;

		try {
			// Check if service file exists using async fs
			fs.accessSync(servicePath);

			// Import the service dynamically
			const serviceModule = await import(`file://${ process.cwd() }/${ servicePath }`);
			this.service = serviceModule.default;
			this.serviceLoaded = true;

			console.info(chalk.green(`✅ Loaded custom service for ${ this.modelName }`));
		} catch(error) {
			if(error.code !== 'ENOENT') {
				console.warn(
					chalk.bgYellow.black.italic(' ⚠️ WARNING '),
					`Failed to load service "${ this.singular }": ${ error }`,
				);
			}
			// Use default PrimateService - no custom service found
			this.serviceLoaded = true;
		}
	}

	/**
	 * Ensure service is loaded before proceeding
	 * @private
	 * @returns {Promise<void>}
	 * @throws {Error} - Throws an error if the service is not loaded.
	 */
	async _ensureServiceLoaded() {
		if(!this.serviceLoaded && this.serviceLoadPromise) {
			await this.serviceLoadPromise;
		}
	}

	/**
	 * Validate and sanitize input data
	 * @private
	 * @param {Object} data - The input data to process.
	 * @param {string} [operation='create'] - The operation type (e.g., 'create', 'update').
	 * @returns {Object} - The processed data.
	 * @throws {Error} - Throws an error if the data is invalid.
	 */
	_processInputData(data, operation = 'create') {
		if(!data || typeof data !== 'object') {
			throw createError.BadRequest('Request body must be a valid object');
		}

		let processedData = { ...data };

		// Remove sensitive fields
		delete processedData.id;
		if(operation === 'create') {
			delete processedData.created;
			delete processedData.modified;
		}

		// Basic sanitization
		if(this.options.sanitizeInput) {
			processedData = this._sanitizeObject(processedData);
		}

		return processedData;
	}

	/**
	 * Recursively sanitize object properties
	 * @private
	 * @param {Object} obj - The object to sanitize.
	 * @returns {Object} - The sanitized object.
	 * @throws {Error} - Throws an error if the object is invalid.
	 */
	_sanitizeObject(obj) {
		if(typeof obj === 'string') return obj.trim();

		if(Array.isArray(obj)) return obj.map(item => this._sanitizeObject(item));

		if(obj && typeof obj === 'object') {
			const sanitized = {};
			for(const [ key, value ] of Object.entries(obj)) {
				sanitized[key] = this._sanitizeObject(value);
			}
			return sanitized;
		}

		return obj;
	}

	/**
	 * Convert query parameters to appropriate types
	 * @private
	 * @param {Object} query - The query parameters.
	 * @returns {Object} - The processed query parameters.
	 * @throws {Error} - Throws an error if the query parameters are invalid.
	 */
	_processQueryParams(query) {
		const processed = { ...query };

		for(const [ key, value ] of Object.entries(processed)) {
			if(typeof value === 'string') {
				// Convert numeric strings to numbers
				const numValue = Number(value);
				if(!isNaN(numValue) && isFinite(numValue)) {
					processed[key] = numValue;
				}

				// Convert boolean strings
				if(value.toLowerCase() === 'true') processed[key] = true;
				if(value.toLowerCase() === 'false') processed[key] = false;
			}
		}

		return processed;
	}

	/**
	 * Handle errors consistently across all methods
	 * @private
	 * @param {Error} error - The error object.
	 * @param {string} operation - The operation being performed (e.g., 'creating', 'fetching').
	 * @param {Object} res - The response object.
	 * @param {Function} next - The next middleware function.
	 * @returns {void}
	 * @throws {Error} - Throws an error if the operation fails.
	 */
	_handleError(error, operation, res, next) {
		console.error(`Error ${ operation } ${ this.modelName }:`, {
			message: error.message,
			code: error.code,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		});

		// Handle known Prisma errors
		if(error.code === 'P2002') {
			return res.respond({
				status: 409,
				message: `${ this.modelName } already exists`,
			});
		}

		if(error.code === 'P2025') {
			return res.respond({
				status: 404,
				message: `${ this.modelName } not found`,
			});
		}

		// Handle validation errors
		if(error.name === 'ValidationError' || error.isJoi) {
			return res.respond({
				status: 400,
				message: error.message.replace(/\n/g, ' '),
			});
		}

		// Handle HTTP errors
		if(error.status || error.statusCode) {
			return res.respond({
				status: error.status || error.statusCode,
				message: error.message,
			});
		}

		// Pass unknown errors to global error handler
		next(createError(500, `Internal server error during ${ operation }`));
	}

	/**
	 * Get all records.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 * @throws {Error} - Throws an error if the records cannot be retrieved.
	 */
	async all(req, res, next) {
		try {
			await this._ensureServiceLoaded();

			const requestOptions = { ...this.options };
			const processedQuery = this._processQueryParams(req.query);

			// Hook all globally
			if(primate.hooks?.all) primate.hooks.all(req, res, next, requestOptions);

			// add the current user id to the data
			if(req.user) requestOptions.user = req.user.payload;

			const result = await this.invokeServiceMethod('all', this.entity, processedQuery, requestOptions);

			// Handle empty results
			if(!result.data || result.data.length === 0) {
				return res.respond({
					status: 200, // Changed from 404 - empty results are valid
					data: [],
					message: `No ${ this.plural } found`,
					meta: { count: 0 },
				});
			}

			return res.respond({
				data: result.data,
				message: `${ this.modelName } retrieved successfully`,
				meta: {
					count: result.count,
					page: processedQuery.page || 1,
					limit: processedQuery.limit || 100,
				},
			});

		} catch(error) {
			this._handleError(error, 'fetching', res, next);
		}
	}

	/**
	 * Create a new record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 * @throws {Error} - Throws an error if the record cannot be created.
	 */
	async create(req, res, next) {
		try {
			await this._ensureServiceLoaded();

			const options = { ...this.options };
			const processedData = this._processInputData(req.body, 'create');

			// add the current user id to the data
			if(req.user) options.idUser = req.user.payload.id;

			// remove id from body
			delete req.body.id;

			const record = await this.invokeServiceMethod('create', this.entity, processedData, options);

			if(typeof this.service?.create !== 'function') {
				console.info(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.create not found, using PrimateService');
			}

			res.respond({
				status: 201,
				data: record,
				message: `${ this.modelName } created successfully`,
			});

		} catch(error) {
			this._handleError(error, 'creating', res, next);
		}
	}

	/**
	 * Get a single record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 * @throws {Error} - Throws an error if the record is not found or if there is an error retrieving it.
	 */
	async get(req, res, next) {
		try {
			await this._ensureServiceLoaded();
			const { id } = req.params;

			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID is required to retrieve an item.',
				});
			}

			const processedQuery = this._processQueryParams(req.query);
			const record = await this.invokeServiceMethod('get', this.entity, id, processedQuery, this.options);
			if(!record) {
				return res.respond({
					status: 404,
					message: `${ this.modelName } not found`,
				});
			}

			if(typeof this.service?.get !== 'function') {
				console.info(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.get not found, using PrimateService');
			}

			if(!record) {
				return res.respond({
					status: 404,
					message: `${ this.modelName } not found`,
				});
			}

			return res.respond({
				data: record,
				message: `${ this.modelName } retrieved successfully`,
			});
		} catch(error) {
			this._handleError(error, 'retrieving', res, next);
		}
	}

	// Update a record
	/**
	 * Updates a record in the database.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to update.
	 * @param {Object} req.body - The data to update.
	 * @param {Object} req.user - The authenticated user object.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 * @throws {Error} - Throws an error if the update fails.
	 */
	async update(req, res, next) {
		try {
			await this._ensureServiceLoaded();

			const { id } = req.params;
			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID parameter is required',
				});
			}

			const options = { ...this.options };
			const processedData = this._processInputData(req.body, 'update');

			// Add current user ID to options
			if(req.user) {
				options.idUser = req.user.payload.id;
			}

			const existingRecord = await this.invokeServiceMethod('get', this.entity, id, {}, options);
			if(!existingRecord) {
				return res.respond({
					status: 404,
					message: `${ this.modelName } not found`,
				});
			}

			const updatedRecord = await this.invokeServiceMethod('update', this.entity, id, processedData, options);

			return res.respond({
				data: updatedRecord,
				message: `${ this.modelName } updated successfully`,
			});
		} catch(error) {
			this._handleError(error, 'updating', res, next);
		}
	}

	/**
	 * Deletes a record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to delete.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 * @throws {Error} - Throws an error if the deletion fails.
	 */
	async delete(req, res, next) {
		try {
			await this._ensureServiceLoaded();

			const { id } = req.params;
			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID parameter is required',
				});
			}

			const record = await this.invokeServiceMethod('delete', this.entity, id, this.options);

			if(!record) {
				return res.respond({
					status: 404,
					message: this.modelName + ' not found',
				});
			}

			return res.respond({
				data: record,
				message: `${ this.modelName } deleted successfully`,
			});
		} catch(e) {
			this._handleError(e, 'deleting', res, next);
		}
	};

	/**
	 * Dynamically calls a service function based on the request.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.body - The body of the request.
	 * @param {Object} res - Express response object.
	 * @throws {Error} If any error occurs during the service call.
	 */
	async serviceCall(req, res) {
		try {
			const { service, functionName } = this;

			if(!service || !functionName) {
				throw new Error('Service and functionName are required.');
			}

			if(typeof service[functionName] !== 'function') {
				throw new Error(`Function "${ functionName }" not found in the service.`);
			}

			// Call the service function dynamically
			const result = await service[functionName](req);

			res.respond({
				data: result,
				message: 'Service called successfully',
			});

		} catch(e) {
			console.error(`Error calling service function "${ this.functionName }":`, e);
			res.respond({
				status: 400,
				message: `Error calling service: ${ e.message }`,
			});
		}
	}

	/**
	 * Updates metadata for a record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to update.
	 * @param {Object} req.body - The new metadata to update.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 * @returns {Object} - The response object.
	 */
	async updateMetas(req, res, next) {
		try {
			await this._ensureServiceLoaded();

			const { id } = req.params;
			const data = req.body;

			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID parameter is required',
				});
			}

			if(!data || typeof data !== 'object' || Object.keys(data).length === 0) {
				return res.respond({
					status: 400,
					message: 'Metadata must be a non-empty object',
				});
			}

			const record = await this.invokeServiceMethod('updateMetas', this.entity, id, data);

			if(!record) {
				return res.respond({
					status: 404,
					message: this.modelName + ' not found',
				});
			}

			return res.respond({
				data: record,
				message: `${ this.modelName } metadata updated successfully`,
			});
		} catch(e) {
			this._handleError(e, 'updating metadata for', res, next);
		}
	}

	/**
	 * Invokes a service method with fallback to PrimateService.
	 *
	 * @param {string} method - The method name to invoke.
	 * @param {...any} args - The arguments to pass to the method.
	 * @returns {Promise<any>} - The result from the service method.
	 */
	async invokeServiceMethod(method, ...args) {
		// Remove the entity parameter since it's the first arg
		const methodArgs = args.slice(1);

		try {
			// Try custom service first
			if(this.service && typeof this.service[method] === 'function') {
				return await this.service[method](...methodArgs);
			}

			// Fall back to PrimateService
			if(typeof PrimateService[method] === 'function') {
				if(process.env.NODE_ENV === 'development') {
					console.info(
						chalk.bgBlue.black.italic(' ℹ️ INFO '),
						`${ this.modelName }Service.${ method } not found, using PrimateService`,
					);
				}
				return await PrimateService[method](...args);
			}

			throw createError(501, `Method ${ method } not implemented in service or PrimateService`);

		} catch(error) {
			// Add context to error
			error.context = {
				controller: this.modelName,
				method,
				entity: this.entity,
			};
			throw error;
		}
	}

	/**
	 * Health check endpoint for this controller
	 */
	async health(req, res) {
		try {
			await this._ensureServiceLoaded();

			res.respond({
				data: {
					controller: this.modelName,
					entity: this.entity,
					serviceLoaded: this.serviceLoaded,
					hasCustomService: !!this.service,
					options: Object.keys(this.options),
				},
				message: `${ this.modelName } controller is healthy`,
			});
		} catch(error) {
			res.respond({
				status: 503,
				message: `${ this.modelName } controller health check failed`,
				error: error.message,
			});
		}
	}
}