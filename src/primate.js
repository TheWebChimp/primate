import express from 'express';
import chalk from 'chalk';
import getPort from 'get-port';
import createError from 'http-errors';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pluralize from 'pluralize';

import createApp from './app.js';
import PrimateService from '#generics/service.js';
import PrimateController from '#generics/controller.js';
import logger from '#utils/logger.js';

/**
 * Class representing the Primate application framework.
 * Provides utilities for setting up Express applications with Prisma integration.
 */
class Primate {
	/**
	 * Configuration defaults
	 * @private
	 */
	static _defaults = {
		port: process.env.PORT || 1337,
		fallbackPorts: [ 1337, 8008, 10101 ],
		entitiesDir: './entities',
		routesDir: './routes',
		prismaClientLocation: '@prisma/client',
		suppressEntitiesNotFound: false,
	};

	/**
	 * Create a new Primate application instance.
	 * @constructor
	 * @param {Object} [config={}] - Optional initial configuration.
	 */
	constructor(config = {}) {
		this.app = null;
		this.prisma = null;
		this.orm = null;
		this.settings = { ...Primate._defaults, ...config };

		// Hook system
		this.hooks = {
			beforeInit: [],
			afterInit: [],
			beforeRouteSetup: [],
			afterRouteSetup: [],
			beforeEntitySetup: [],
			afterEntitySetup: [],
			beforeServerStart: [],
			afterServerStart: [],
			onError: [],
		};
	}

	/**
	 * Use middleware in the express app.
	 * @param  {...any} args - The middleware(s) to use.
	 * @returns {Primate} - The Primate instance for chaining.
	 * @throws {Error} - If the app hasn't been initialized.
	 */
	use(...args) {
		if(!this.app) {
			throw new Error('App must be initialized before adding middleware. Call setup() first.');
		}
		this.app.use(...args);
		return this;
	}

	/**
	 * Add a hook function for a specific event.
	 * @param {string} event - The hook event name.
	 * @param {Function} fn - Function to execute.
	 * @param {Object} [options={}] - Hook options.
	 * @param {number} [options.priority=10] - Priority (lower runs first).
	 * @returns {Primate} - The Primate instance for chaining.
	 * @throws {Error} - If the event is invalid or the function is not callable.
	 */
	addHook(event, fn, options = {}) {
		if(!this.hooks[event]) {
			throw new Error(`Invalid hook event: ${ event }. Available events: ${ Object.keys(this.hooks)
				.join(', ') }`);
		}

		if(typeof fn !== 'function') {
			throw new Error('Hook must be a function');
		}

		const priority = options.priority || 10;

		this.hooks[event].push({ fn, priority });
		this.hooks[event].sort((a, b) => a.priority - b.priority);

		return this;
	}

	/**
	 * Run hooks for a specific event.
	 * @param {string} event - The hook event to run.
	 * @param {Object} context - Context object passed to hook functions.
	 * @returns {Promise<Object>} - The potentially modified context.
	 * @private
	 */
	async _runHooks(event, context = {}) {
		if(!this.hooks[event]) {
			return context;
		}

		let ctx = { ...context };

		for(const hook of this.hooks[event]) {
			try {
				const result = await hook.fn(ctx);
				// Update context if hook returns a value
				if(result !== undefined) {
					ctx = result;
				}
			} catch(error) {
				logger.error(`Error in ${ event } hook:`, error);
				// Run error hooks
				await this._runHooks('onError', {
					error,
					event,
					context: ctx,
				});
			}
		}

		return ctx;
	}

	/**
	 * Start the Primate application server.
	 * @param {number|string} [port] - The port to listen on (overrides config).
	 * @returns {Promise<void>} - A promise that resolves when the server starts.
	 */
	async start(port) {
		if(!this.app) {
			throw new Error('App must be initialized before starting. Call setup() first.');
		}

		// Use provided port or default from settings
		const portToUse = port || this.settings.port;
		const fallbackPorts = this.settings.fallbackPorts;

		// Combine the provided port with fallbacks
		const portsToTry = Array.isArray(portToUse) ? portToUse : [ portToUse, ...fallbackPorts ];

		try {
			// Run before server start hooks
			await this._runHooks('beforeServerStart', {
				port: portToUse,
				app: this.app,
			});

			// Get an available port
			const availablePort = await getPort({ port: portsToTry });

			// Start the server
			const server = this.app.listen(availablePort, () => {
				logger.info(chalk.white.bgRgb(204, 0, 0).bold(` 🐵 🙈 🙉 🙊 PRIMATE STARTED 🙊 🙉 🙈 🐵 `));
				logger.info(chalk.yellowBright.bgBlack.bold(`Listening on port ${ availablePort }! `));
			});

			// Run after server start hooks
			await this._runHooks('afterServerStart', {
				port: availablePort,
				app: this.app,
				server,
			});

			return server;
		} catch(error) {
			logger.error(chalk.red('Error starting server:'), error);
			await this._runHooks('onError', {
				error,
				stage: 'serverStart',
				port: portToUse,
			});
			throw error;
		}
	}

	/**
	 * Set up routes from a directory.
	 * @param {string} [routesDir] - The directory containing route files.
	 * @returns {Promise<void>} - A promise that resolves when routes are set up.
	 */
	async setupRoutes(routesDir) {
		const dirToUse = routesDir || this.settings.routesDir;

		try {
			// Run before route setup hooks
			const context = await this._runHooks('beforeRouteSetup', {
				routesDir: dirToUse,
				app: this.app,
			});

			// Import routes
			const routes = await Primate.importRoutes(context.routesDir);

			// Setup routes
			Primate.setupRoutes(routes, this.app);

			// Run after route setup hooks
			await this._runHooks('afterRouteSetup', {
				routesDir: dirToUse,
				routes,
				app: this.app,
			});
		} catch(error) {
			logger.error(chalk.red(`Error setting up routes from ${ dirToUse }:`), error);
			await this._runHooks('onError', {
				error,
				stage: 'routeSetup',
				routesDir: dirToUse,
			});
			throw error;
		}
	}

	/**
	 * Set up entities and initialize the application.
	 * @param {Object} [config={}] - Configuration options.
	 * @returns {Promise<Primate>} - The initialized Primate instance.
	 */
	async setup(config = {}) {
		try {
			// Merge configs
			this.settings = {
				...this.settings,
				...config,
			};

			// Run before init hooks
			const context = await this._runHooks('beforeInit', {
				config: this.settings,
			});

			// Create Express app
			this.app = createApp(context.config.app || {});

			// Initialize Prisma if enabled
			if(context.config.usePrisma !== false) {
				await this._initializePrisma(context.config);
			} else {
				logger.info(chalk.yellow('⚠️💎 Prisma is not enabled'));
			}

			// Run after init hooks
			await this._runHooks('afterInit', {
				app: this.app,
				prisma: this.prisma,
				orm: this.orm,
				config: context.config,
			});

			return this;
		} catch(error) {
			logger.error(chalk.red('Error during setup:'), error);
			await this._runHooks('onError', {
				error,
				stage: 'setup',
				config,
			});
			throw error;
		}
	}

	/**
	 * Initialize Prisma client and ORM.
	 * @param {Object} config - Configuration options.
	 * @returns {Promise<void>} - A promise that resolves when Prisma is initialized.
	 * @private
	 */
	async _initializePrisma(config) {
		const prismaClientLocation = config.prismaClientLocation || Primate._defaults.prismaClientLocation;
		const entitiesDir = config.entitiesDir || Primate._defaults.entitiesDir;

		try {
			// Import Prisma client
			const prismaClient = await import(prismaClientLocation);
			logger.info(chalk.green('⚠️💎 Prisma client imported successfully'));

			// Create Prisma client instance
			this.prisma = new prismaClient.PrismaClient();

			// Generate ORM object
			this.orm = Primate.generatePrismaOrmObject(prismaClient.Prisma);

			// Initialize service with Prisma and ORM
			PrimateService.initialize(this.prisma, this.orm);

			// Run before entity setup hooks
			const context = await this._runHooks('beforeEntitySetup', {
				entitiesDir,
				prisma: this.prisma,
				orm: this.orm,
			});

			// Import and setup entities
			const entities = await Primate.importEntities(context.entitiesDir, this.settings);
			Primate.setupRoutes(entities, this.app);

			// Run after entity setup hooks
			await this._runHooks('afterEntitySetup', {
				entitiesDir: context.entitiesDir,
				entities,
				prisma: this.prisma,
				orm: this.orm,
			});
		} catch(error) {
			logger.error(chalk.red('Error initializing Prisma:'), error);
			throw new Error(`Error initializing Prisma: ${ error.message }`);
		}
	}

	/**
	 * Asynchronously imports route modules from a directory.
	 * @param {string} directory - Directory containing route modules.
	 * @returns {Promise<Object>} - Object with imported route modules.
	 * @throws {Error} - If directory is invalid or import fails.
	 */
	static async importRoutes(directory) {
		// Validate directory
		if(typeof directory !== 'string' || directory.trim() === '') {
			throw new Error('Directory must be a non-empty string');
		}

		const modules = {};

		try {
			// Read all file names in the directory
			const files = await fs.readdir(directory);

			for(const file of files) {
				// Skip files that are not JavaScript files
				if(path.extname(file) !== '.js') continue;

				try {
					// Dynamically import the module
					const fullPath = path.join(process.cwd(), directory, file);
					const { router } = await import(`file://${ fullPath }`);

					// Add the router to the modules object
					const moduleName = path.basename(file, '.js');
					modules[moduleName] = router;
				} catch(error) {
					logger.warn(
						chalk.bgYellow.black.italic(' ⚠️ WARNING '),
						`Error importing router from ${ file }:`,
						error.message,
					);
				}
			}

			return modules;
		} catch(error) {
			throw new Error(`Failed to import routes: ${ error.message }`);
		}
	}

	/**
	 * Asynchronously imports entity modules from a directory.
	 * @param {string} directory - Directory containing entity folders.
	 * @param {Object} settings - Application settings.
	 * @returns {Promise<Object>} - Object with imported entity modules.
	 * @throws {Error} - If directory is invalid or import fails.
	 */
	static async importEntities(directory, settings = {}) {
		// Validate directory
		if(typeof directory !== 'string' || directory.trim() === '') {
			throw new Error('Directory must be a non-empty string');
		}

		const entities = {};

		try {
			// Check if directory exists
			if(!existsSync(directory)) {
				logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Entities directory not found: ${ directory }`);
				return entities;
			}

			// Read all file names in the directory
			const files = await fs.readdir(directory);

			for(const file of files) {
				try {
					// Each file should be a directory with an entity file
					const entityName = file;
					const entityFile = path.join(directory, file, `${ file }.js`);

					// Check if the file exists
					if(!existsSync(entityFile)) {
						if(!settings.suppressEntitiesNotFound) {
							logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Entity file not found: ${ entityFile }`);
						}
						continue;
					}

					// Dynamically import the module
					const fullPath = path.join(process.cwd(), entityFile);
					const { router } = await import(`file://${ fullPath }`);

					// Add the router to the entities object
					entities[entityName] = router;
				} catch(error) {
					logger.warn(
						chalk.bgYellow.black.italic(' ⚠️ WARNING '),
						`Error importing entity "${ file }":`,
						error.message,
					);
				}
			}

			return entities;
		} catch(error) {
			throw new Error(`Failed to import entities: ${ error.message }`);
		}
	}

	/**
	 * Sets up routes for the given modules on an Express app.
	 * @param {Object} modules - Object with module names and routers.
	 * @param {Object} app - Express application instance.
	 * @throws {Error} - If parameters are invalid.
	 */
	static setupRoutes(modules, app) {
		// Validate parameters
		if(typeof modules !== 'object' || modules === null) {
			throw new Error('Modules must be a non-null object');
		}

		if(typeof app !== 'function' || typeof app.use !== 'function') {
			throw new Error('App must be a valid Express application instance');
		}

		// Track registered routes for logging
		const registeredRoutes = [];

		// Iterate modules and add them to the app
		for(const [ moduleName, router ] of Object.entries(modules)) {
			// Validate router
			if(typeof router !== 'function') {
				logger.error(`Router for module "${ moduleName }" is not a valid function`);
				continue;
			}

			try {
				// If the module name is 'index', 'default' or 'base', add to root
				if([ 'index', 'default', 'base' ].includes(moduleName)) {
					app.use('/', router);
					registeredRoutes.push(`/${ moduleName } -> /`);
				} else {
					app.use(`/${ moduleName }`, router);
					registeredRoutes.push(`/${ moduleName }`);
				}
			} catch(error) {
				logger.error(`Failed to setup route for module "${ moduleName }":`, error);
			}
		}

		// Log registered routes
		if(registeredRoutes.length > 0) {
			logger.info(chalk.green('✓ Registered routes:'), registeredRoutes.join(', '));
		}

		// Set up a status route
		Primate.setupStatusRoute(app);
	}

	/**
	 * Sets up a status route on the Express app.
	 * @param {Object} app - Express application instance.
	 * @throws {Error} - If the app parameter is invalid.
	 */
	static setupStatusRoute(app) {
		// Validate the app parameter
		if(typeof app !== 'function' || typeof app.get !== 'function') {
			throw new Error('App must be a valid Express application instance');
		}

		// Array of funny phrases
		const phrases = [
			'Primate is running smoother than a dolphin gliding through the ocean.',
			'Primate is running more efficiently than a Swiss watch on New Year\'s Eve.',
			'Primate is running faster than a cheetah chasing the last bus of the night.',
			'Primate is running more reliably than a postman in the rain.',
			'Primate is running cooler than a polar bear on an ice floe.',
			'Primate is running with more agility than a circus acrobat on tightrope.',
			'Primate is running more gracefully than a ballet dancer in the spotlight.',
			'Primate is running steadier than a lighthouse in a stormy sea.',
			'Primate is running more tirelessly than an energizer bunny on a marathon.',
			'Primate is running more powerfully than a superhero saving the day.',
			'Primate is running smoother than a jazz musician in a late-night jam session.',
			'Primate is running with more precision than an eagle swooping for its prey.',
			'Primate is running more harmoniously than a choir singing a festive carol.',
		];

		// Add status route
		app.get('/', (req, res) => {
			res.respond({
				data: {
					time: new Date(),
					status: 'healthy',
					version: process.env.npm_package_version || 'unknown',
				},
				message: phrases[Math.floor(Math.random() * phrases.length)],
			});
		});
	}

	/**
	 * Checks for missing required fields.
	 * @param {Object} fields - Object with required fields and values.
	 * @returns {Error|null} - BadRequest error if fields missing, null otherwise.
	 * @throws {Error} - If fields parameter is invalid.
	 */
	static requiredFields(fields = {}) {
		// Validate the field parameter
		if(typeof fields !== 'object' || fields === null) {
			throw new Error('Fields must be a non-null object');
		}

		// If there are no fields, return immediately
		if(Object.keys(fields).length === 0) return null;

		// Filter out missing fields
		const missingFields = Object.keys(fields).filter(field => !fields[field]);

		// If there are missing fields, create and return an error
		if(missingFields.length) {
			const missingFieldsStr = missingFields.join(', ');
			return createError.BadRequest(`Missing required fields: ${ missingFieldsStr }`);
		}

		return null;
	}

	/**
	 * Validates data against a schema for an entity.
	 * @param {string} entity - The entity name.
	 * @param {Object} data - The data to validate.
	 * @returns {Promise<Object>} - The validated data.
	 * @throws {Error} - If validation fails.
	 */
	static async validateSchema(entity, data) {
		// Get the schema file path
		const schemaPath = path.join(
			process.cwd(),
			'entities',
			pluralize(entity),
			`${ entity }.schema.js`,
		);

		// If the file does not exist, return the data as is
		if(!existsSync(schemaPath)) {
			logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Schema file not found for entity "${ entity }"`);
			return data;
		}

		try {
			// Import the schema file
			const schema = await import(`file://${ schemaPath }`);

			// Check that schema is a Joi object
			if(typeof schema.default !== 'object') {
				logger.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Schema file for entity "${ entity }" does not export a Joi object`);
				return data;
			}

			// Validate the data against the schema
			return await schema.default.validateAsync(data);
		} catch(error) {
			// Better error message for validation failures
			if(error.details && Array.isArray(error.details)) {
				const messages = error.details.map(detail => detail.message).join(', ');
				throw createError.BadRequest(`Schema validation failed: ${ messages }`);
			} else {
				throw createError.BadRequest(`Schema validation failed: ${ error.message }`);
			}
		}
	}

	/**
	 * Generates an ORM object from the Prisma data model.
	 * @param {Object} Prisma - Prisma client object.
	 * @returns {Object} - ORM object with models and relations.
	 * @throws {Error} - If Prisma DMMF is not available.
	 */
	static generatePrismaOrmObject(Prisma) {
		if(!Prisma.dmmf) {
			throw new Error('Prisma DMMF is not available.');
		}

		// Create ORM object from Prisma models
		const ormObject = {};
		const prismaModels = Prisma.dmmf.datamodel.models;

		// First pass: create model structures
		for(const model of prismaModels) {
			const modelName = model.name;

			if(modelName) {
				const camelCaseModelName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
				ormObject[camelCaseModelName] = {};

				// Add fields
				for(const field of model.fields) {
					const fieldName = field.name;
					ormObject[camelCaseModelName][fieldName] = field.type;

					// Add additional field metadata
					if(field.isId) {
						ormObject[camelCaseModelName][`${ fieldName }_isId`] = true;
					}
					if(field.isUnique) {
						ormObject[camelCaseModelName][`${ fieldName }_isUnique`] = true;
					}
					if(field.isRequired) {
						ormObject[camelCaseModelName][`${ fieldName }_isRequired`] = true;
					}
				}
			}
		}

		// Second pass: add relations
		const modelNames = Object.keys(ormObject);

		// Add many-to-many relations
		for(const model of modelNames) {
			Primate._addManyToManyRelations(ormObject, modelNames, model);
		}

		// Add one-to-many relations
		for(const model of modelNames) {
			Primate._addOneToManyRelations(ormObject, modelNames, model);
		}

		return ormObject;
	}

	/**
	 * Creates a new Express router.
	 * @returns {Object} - A new Express router instance.
	 */
	static getRouter() {
		return express.Router();
	}

	/**
	 * Sets up routes for a model using a provided router.
	 * @param {string} model - The model name.
	 * @param {Object} router - The Express router.
	 * @param {Object} [options={}] - Optional parameters.
	 * @returns {Object} - The router with routes.
	 */
	static setupRoute(model, router, options = {}) {
		const controller = new PrimateController(model, options);
		const routeHandler = options.router || router;

		PrimateService.prepareCrUDAGRoutes(controller, routeHandler, options);

		return routeHandler;
	}

	/**
	 * Adds many-to-many relations to the model object.
	 * @param {Object} ormObject - ORM object with models and fields.
	 * @param {string[]} models - Array of model names.
	 * @param {string} model - Current model name.
	 * @private
	 */
	static _addManyToManyRelations(ormObject, models, model) {
		for(const otherModel of models) {
			if(model === otherModel) continue;

			const otherModelPlural = pluralize(otherModel);
			const otherModelPluralCamelCase = otherModelPlural.charAt(0).toLowerCase() + otherModelPlural.slice(1);
			const modelPlural = pluralize(model);
			const modelPluralCamelCase = modelPlural.charAt(0).toLowerCase() + modelPlural.slice(1);

			// Check if both sides have the relation fields
			const modelHasOther = ormObject[model][otherModelPluralCamelCase];
			const otherHasModel = ormObject[otherModel][modelPluralCamelCase];

			if(modelHasOther && otherHasModel) {
				// Initialize relations object if needed
				if(typeof ormObject[model].relations === 'undefined') {
					ormObject[model].relations = {};
				}

				// Add the many-to-many relation
				ormObject[model].relations[otherModel] = {
					type: 'many-to-many',
					model: otherModel,
					plural: otherModelPlural,
					field: otherModelPluralCamelCase,
					inversePlural: modelPluralCamelCase,
				};
			}
		}
	}

	/**
	 * Adds one-to-many relations to the model object.
	 * @param {Object} ormObject - ORM object with models and fields.
	 * @param {string[]} models - Array of model names.
	 * @param {string} model - Current model name.
	 * @private
	 */
	static _addOneToManyRelations(ormObject, models, model) {
		// Look for foreign key patterns
		for(const otherModel of models) {
			if(model === otherModel) continue;

			const otherModelCamelCase = otherModel.charAt(0).toUpperCase() + otherModel.slice(1);
			const modelPluralCamelCase = pluralize(model).charAt(0).toLowerCase() + pluralize(model).slice(1);

			// Check model fields for foreign keys
			for(const field of Object.keys(ormObject[model])) {
				// Skip relations field
				if(field === 'relations') continue;

				// Check for common foreign key patterns
				const isForeignKey = (
					field === `${ otherModel }Id` ||
					field === `id${ otherModelCamelCase }` ||
					field === `${ otherModel }_id`
				);

				if(isForeignKey) {
					// Check if the other model has a plural field for this model
					const otherHasPlural = Object.keys(ormObject[otherModel]).some(f =>
						f === modelPluralCamelCase || f === pluralize(model),
					);

					if(otherHasPlural) {
						// Initialize relations object if needed
						if(typeof ormObject[model].relations === 'undefined') {
							ormObject[model].relations = {};
						}

						// Add the one-to-many relation
						ormObject[model].relations[otherModel] = {
							type: 'one-to-many',
							model: otherModel,
							field: field,
							inversePlural: modelPluralCamelCase,
						};
					}
				}
			}
		}
	}

	/**
	 * Get a reference to the Prisma client.
	 * @returns {Object} - The Prisma client.
	 */
	getPrisma() {
		return this.prisma;
	}

	/**
	 * Get a reference to the ORM object.
	 * @returns {Object} - The ORM object.
	 */
	getOrm() {
		return this.orm;
	}

	/**
	 * Get a reference to the Express app.
	 * @returns {Object} - The Express app.
	 */
	getApp() {
		return this.app;
	}

	/**
	 * Gracefully shutdown the application.
	 * @returns {Promise<boolean>} - Promise that resolves when shutdown is complete.
	 */
	async shutdown() {
		try {
			// Disconnect Prisma if connected
			if(this.prisma) {
				await this.prisma.$disconnect();
			}

			// Log shutdown
			logger.info(chalk.yellow('🛑 Primate shutting down...'));

			return true;
		} catch(error) {
			logger.error('Error during shutdown:', error);
			return false;
		}
	}
}

export default Primate;