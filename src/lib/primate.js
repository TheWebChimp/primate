import express from 'express';
import chalk from 'chalk';
import getPort from 'get-port';
import createError from 'http-errors';
import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';

import createApp from './app.js';
import PrimateService from './service.js';
import PrimateController from './controller.js';

import config from '../utils/config.js';

/**
 * Class representing the Primate application.
 */
class Primate {

	static prisma = null;
	static app = null;
	static orm = null;

	/**
	 * @property {Object} hooks - Hooks for the Primate application.
	 * @property {Object} [hooks.beforeRequest] - Hook to be executed before each request.
	 * @property {Object} [hooks.beforeShutdown] - Hook to be executed before the application shuts down.
	 */
	static hooks = {};

	/**
	 * @property {Object} settings - Settings for the Primate application.
	 * @property {Object} [settings.suppressEntitiesNotFound] - Suppress warnings for missing entities.
	 */
	static settings = {};

	/**
	 * Create a new Primate application.
	 * @constructor
	 */
	/**
	 * Create a new Primate application.
	 * @param {Object} [appConfig={}] - Configuration options for the Express app.
	 * @constructor
	 */
	constructor(appConfig = {}) {
		// Create the Express app with the improved configuration
		this.app = createApp({
			// Default Primate-specific configurations
			allowedHeaders: [ 'X-Primate-Version', 'X-Entity-Type' ],
			cors: {
				credentials: true,
				origin: process.env.CORS_ORIGIN || true,
			},
			rateLimit: {
				windowMs: 15 * 60 * 1000, // 15 minutes
				max: process.env.RATE_LIMIT_MAX || 1000,
				skip: (req) => {
					// Skip rate limiting for health checks and status routes
					return req.path === '/health' || req.path === '/';
				},
			},
			helmet: {
				contentSecurityPolicy: {
					directives: {
						defaultSrc: [ '\'self\'' ],
						styleSrc: [ '\'self\'', '\'unsafe-inline\'' ],
						scriptSrc: [ '\'self\'' ],
						imgSrc: [ '\'self\'', 'data:', 'https:' ],
						connectSrc: [ '\'self\'', process.env.API_URL || '\'self\'' ],
					},
				},
			},
			// Pre-processing hook to add Primate-specific middleware
			preProcess: (app) => {
				// Add any Primate-specific middleware before the standard middleware
				app.use((req, res, next) => {
					req.primate = {
						startTime: Date.now(),
						version: process.env.PRIMATE_VERSION || '1.0.0',
					};
					res.setHeader('X-Primate-Framework', 'true');
					next();
				});
			},
			// Post-processing hook for additional customization
			postProcess: (app) => {
				// Add Primate-specific routes or middleware after standard setup
				this.setupPrimateMiddleware(app);
			},
			// Merge with user-provided config
			...appConfig,
		});

		// Set static reference
		Primate.app = this.app;

		this.hooks = {};
		this.prisma = null;
		this.orm = null;
		this.settings = {};
	}

	/**
	 * Set up Primate-specific middleware.
	 * @param {Object} app - Express app instance
	 */
	setupPrimateMiddleware(app) {
		// Request timing middleware
		app.use((req, res, next) => {
			const originalRespond = res.respond;
			res.respond = function(options = {}) {
				const responseTime = Date.now() - req.primate.startTime;
				return originalRespond.call(this, {
					...options,
					meta: {
						responseTime: `${ responseTime }ms`,
						...options.meta,
					},
				});
			};
			next();
		});

		// Global hooks middleware
		app.use((req, res, next) => {
			if(this.hooks.beforeRequest) {
				this.hooks.beforeRequest(req, res);
			}
			next();
		});
	}

	/**
	 * Use middleware in the express app.
	 * @param  {...any} args - The middleware(s) to use.
	 */
	use(...args) {
		this.app.use(...args);
	}

	/**
	 * Start the Primate application.
	 * @param {string|number} [port=config.server.port] - The port to listen on.
	 * @param {Function} [callback] - Optional callback function.
	 */
	async start(port = config.server.port, callback) {
		try {

			// Fallback to a list of ports if env.PORT is not set
			const ports = port ? [ port, ...config.server.fallbackPorts ] : config.server.fallbackPorts;
			const availablePort = await getPort({ port: ports });

			const server = this.app.listen(availablePort, () => {
				if(availablePort !== port) {
					console.warn(chalk.yellow(`⚠️  Port ${ port } is not available, using port ${ availablePort } instead.`));
				}

				console.info(chalk.white.bgRgb(204, 0, 0).bold(` 🐵 🙈 🙉 🙊 PRIMATE STARTED 🙊 🙉 🙈 🐵 `));
				console.info(chalk.yellowBright.bgBlack.bold(`Listening on port ${ availablePort }! `));
				console.info(chalk.blue(`Health check available at http://localhost:${ availablePort }/health`));

				if(process.env.NODE_ENV === 'development') {
					console.info(chalk.gray(`API Documentation: http://localhost:${ availablePort }/docs`));
				}

				if(callback) callback(server, availablePort);
			});

			// Graceful shutdown handling
			this.setupGracefulShutdown(server);

			return server;

		} catch(error) {
			console.error(chalk.red('Failed to start Primate application:'), error);
			throw error;
		}
	}

	/**
	 * Set up graceful shutdown handling.
	 * @param {Object} server - HTTP server instance
	 */
	setupGracefulShutdown(server) {
		const gracefulShutdown = async (signal) => {
			console.info(chalk.yellow(`Received ${ signal }. Starting graceful shutdown...`));

			server.close(async () => {
				console.info(chalk.green('HTTP server closed.'));

				// Close Prisma connection if it exists
				if(this.prisma) {
					try {
						await this.prisma.$disconnect();
						console.info(chalk.green('Prisma connection closed.'));
					} catch(error) {
						console.error(chalk.red('Error closing Prisma connection:'), error);
					}
				}

				// Run shutdown hooks
				if(this.hooks.beforeShutdown) {
					try {
						await this.hooks.beforeShutdown();
					} catch(error) {
						console.error(chalk.red('Error in shutdown hook:'), error);
					}
				}

				console.info(chalk.green('Graceful shutdown completed.'));
				process.exit(0);
			});

			// Force shutdown after 10 seconds
			setTimeout(() => {
				console.error(chalk.red('Forced shutdown after timeout.'));
				process.exit(1);
			}, 10000);
		};

		process.on('SIGTERM', gracefulShutdown);
		process.on('SIGINT', gracefulShutdown);
	}

	/**
	 * Add a global hook.
	 * @param {string} event - Hook event name
	 * @param {Function} fn - Hook function
	 */
	addHook(event, fn) {
		if(typeof fn !== 'function') throw new Error('Hook must be a function');
		this.hooks[event] = fn;
	}

	/**
	 * Set up routes from a directory.
	 * @param {string} [routesDir='./routes'] - The directory containing route files.
	 */
	async routes(routesDir = './routes') {
		try {
			console.info(chalk.blue(`Loading routes from ${ routesDir }...`));
			const routes = await Primate.importRoutes(routesDir);
			Primate.setupRoutes(routes, this.app);
			console.info(chalk.green(`✅ Routes loaded successfully from ${ routesDir }`));
		} catch(error) {
			console.error(chalk.red(`❌ Error setting up routes from ${ routesDir }:`), error);
			throw error;
		}
	}

	/**
	 * Set up entities from a directory.
	 * @param {Object} [userConfig={}] - The configuration object.
	 * @param {Object} [userConfig.app={}] - Additional app configuration.
	 * @param {string} [userConfig.entitiesDir=config.primate.entitiesDir] - The directory containing entity folders.
	 * @param {string} [userConfig.prismaClientLocation=config.primate.prismaClientLocation] - The location of the Prisma client.
	 * @param {boolean} [userConfig.usePrisma=true] - Whether to use Prisma.
	 * @param {Object} [userConfig.settings={}] - Additional settings.
	 * @throws {Error} - Throws an error if the entities directory is not found, or if any other error occurs during the setup process.
	 * @returns {Promise<void>} - A promise that resolves when the setup is complete.
	 */
	async setup(userConfig = {}) {
		try {
			const entitiesDir = userConfig.entitiesDir || config.primate.entitiesDir;
			const prismaClientLocation = userConfig.prismaClientLocation || config.primate.prismaClientLocation;
			const usePrisma = userConfig.usePrisma !== undefined ? userConfig.usePrisma : config.primate.enablePrisma

			this.settings = { ...this.settings, ...config.settings };
			Primate.settings = this.settings;

			console.info(chalk.blue('🔧 Setting up Primate application...'));

			// Check that the entities directory exists
			if(!fs.existsSync(entitiesDir)) {
				console.warn(chalk.yellow(`⚠️  Entities directory not found: ${ entitiesDir }`));
				if(usePrisma) {
					console.warn(chalk.yellow('Consider creating the entities directory or disabling Prisma.'));
				}
			}

			// import the Prisma client based on the location provided
			if(usePrisma) {
				await this.setupPrisma(prismaClientLocation);
				await this.setupEntities(entitiesDir);
			} else {
				console.info(chalk.yellow('⚠️💎 Prisma is not enabled'));
			}
		} catch(error) {
			console.error(chalk.red('❌ Failed to setup Primate application:'), error);
			throw error;
		}
	}

	/**
	 * Set up Prisma client and ORM.
	 * @param {string} prismaClientLocation - Location of Prisma client
	 */
	async setupPrisma(prismaClientLocation) {
		try {
			console.info(chalk.blue('💎 Setting up Prisma...'));

			const prismaClient = await import(prismaClientLocation);
			this.prisma = new prismaClient.PrismaClient({
				log: process.env.NODE_ENV === 'development' ? [ 'query', 'info', 'warn', 'error' ] : [ 'error' ],
			});
			Primate.prisma = this.prisma;

			// Test the connection
			await this.prisma.$connect();
			console.info(chalk.green('✅ Prisma client connected successfully'));

			// Generate ORM object
			this.orm = Primate.generatePrismaOrmObject(prismaClient.Prisma);
			Primate.orm = this.orm;

			// Initialize service
			PrimateService.initialize(this.prisma, this.orm);
			console.info(chalk.green('✅ Prisma ORM and service initialized'));

		} catch(error) {
			console.error(chalk.red('❌ Error setting up Prisma:'), error);
			throw new Error(`Error setting up Prisma: ${ error.message }`);
		}
	}

	/**
	 * Set up entities and their routes.
	 * @param {string} entitiesDir - Entities directory path
	 */
	async setupEntities(entitiesDir) {
		try {
			console.info(chalk.blue(`📁 Loading entities from ${ entitiesDir }...`));

			const entities = await Primate.importEntities(entitiesDir);
			const entityCount = Object.keys(entities).length;

			if(entityCount === 0) {
				console.warn(chalk.yellow('⚠️  No entities found'));
				return;
			}

			Primate.setupRoutes(entities, this.app);
			console.info(chalk.green(`✅ ${ entityCount } entities loaded successfully`));

		} catch(error) {
			console.error(chalk.red(`❌ Error setting up entities from ${ entitiesDir }:`), error);
			throw new Error(`Error setting up entities: ${ error.message }`);
		}
	}

	/**
	 * Asynchronously imports route modules from a specified directory.
	 *
	 * @param {string} directory - The directory containing route modules.
	 * @returns {Promise<Object>} - A promise that resolves to an object containing the imported route modules.
	 * @throws {Error} - Throws an error if the directory parameter is missing or invalid, or if any other error occurs during the import process.
	 */
	static async importRoutes(directory) {
		// Validate directory
		if(typeof directory !== 'string' || directory.trim() === '') {
			throw new Error('Directory must be a non-empty string');
		}

		const modules = {};

		try {
			// Check if directory exists
			if(!fs.existsSync(directory)) {
				console.warn(chalk.yellow(`⚠️  Routes directory not found: ${ directory }`));
				return modules;
			}

			// Read all file names in the directory
			const files = fs.readdirSync(directory);

			for(const file of files) {
				// Skip files that are not JavaScript files
				if(path.extname(file) !== '.js') continue;

				try {
					// Dynamically import the module
					const module = await import(`file://${ process.cwd() }/${ directory }/${ file }`);
					const router = module.router || module.default;

					if(!router) {
						console.warn(chalk.yellow(`⚠️  No router exported from ${ file }`));
						continue;
					}

					// Add the router to the modules object
					const moduleName = path.basename(file, '.js');
					modules[moduleName] = router;
					console.info(chalk.gray(`   📄 Loaded route: ${ moduleName }`));
				} catch(error) {
					console.error(chalk.red(`❌ Error importing route ${ file }:`), error);
				}
			}
		} catch(error) {
			// Handle and rethrow any errors that occur during the import process
			throw new Error(`Failed to import routes: ${ error.message }`);
		}

		return modules;
	}

	/**
	 * Asynchronously imports entity modules from a specified directory.
	 *
	 * @param {string} directory - The directory containing entity folders.
	 * @returns {Promise<Object>} - A promise that resolves to an object containing the imported entity modules.
	 * @throws {Error} - Throws an error if the directory parameter is missing or invalid.
	 */
	static async importEntities(directory) {
		// Validate directory
		if(typeof directory !== 'string' || directory.trim() === '') {
			throw new Error('Directory must be a non-empty string');
		}

		const entities = {};
		const entitiesDir = directory;

		try {
			// Check if directory exists
			if(!fs.existsSync(entitiesDir)) {
				console.warn(chalk.yellow(`⚠️  Entities directory not found: ${ entitiesDir }`));
				return entities;
			}

			// Read all file names in the directory
			const files = fs.readdirSync(entitiesDir);

			for(const file of files) {
				try {
					// Each file is a directory, read the file with the same name as the directory
					const entityName = file;
					const entityFile = `${ entitiesDir }/${ file }/${ file }.js`;

					// Skip if the file is not a JavaScript file
					if(path.extname(entityFile) !== '.js') continue;

					// Check if the file exists
					if(!fs.existsSync(entityFile)) {
						if(!Primate.settings.suppressEntitiesNotFound) {
							console.warn(chalk.yellow(`⚠️  Entity file not found: ${ entityFile }`));
						}
						continue;
					}

					// Dynamically import the module
					const module = await import(`file://${ process.cwd() }/${ entityFile }`);
					const router = module.router || module.default;

					if(!router) {
						console.warn(chalk.yellow(`⚠️  No router exported from ${ entityFile }`));
						continue;
					}

					// Add the router to the entities object
					entities[entityName] = router;
					console.info(chalk.gray(`   📦 Loaded entity: ${ entityName }`));
				} catch(e) {
					// if error contains 'Error: File not found', ignore it
					if(e.message.includes('File not found')) {
						if(!Primate.settings.suppressEntitiesNotFound) {
							console.warn(chalk.yellow(`⚠️  ${ e.message }`));
						}
					} else {
						console.warn(chalk.yellow(`⚠️  Error in entity "${ file }":`, e.message));
					}
				}
			}
		} catch(error) {
			throw new Error(`Failed to import entities: ${ error.message }`);
		}

		return entities;
	}

	/**
	 * Sets up routes for the given modules on the provided Express app.
	 *
	 * @param {Object} modules - An object where keys are module names and values are routers.
	 * @param {Object} app - An instance of an Express application.
	 * @param {Function} app.use - The Express app's use method.
	 * @param {Function} app.get - The Express app's GET method.
	 * @throws {Error} - Throws an error if the parameters are invalid.
	 */
	static setupRoutes(modules, app) {
		// Validate parameters
		if(typeof modules !== 'object' || modules === null) {
			throw new Error('Modules must be a non-null object');
		}

		if(typeof app !== 'function' || typeof app.use !== 'function') {
			throw new Error('App must be a valid Express application instance');
		}

		// Iterate modules and add them to the app
		for(const [ moduleName, router ] of Object.entries(modules)) {
			// Validate router
			if(typeof router !== 'function') {
				console.error(chalk.red(`❌ Router for module "${ moduleName }" is not a valid function`));
				continue;
			}

			// If the module name is 'index', 'default' or 'base', add the router to the root of the app
			if([ 'index', 'default', 'base' ].includes(moduleName)) {
				app.use('/', router);
				console.info(chalk.green(`   🌐 Mounted ${ moduleName } routes at /`));
				continue;
			}

			try {
				app.use(`/${ moduleName }`, router);
				console.info(chalk.green(`   🌐 Mounted ${ moduleName } routes at /${ moduleName }`));
			} catch(err) {
				console.error(chalk.red(`❌ Failed to setup route for module "${ moduleName }":`), err);
			}
		}

		// Set up a status route (only if no index route was mounted)
		if(![ 'index', 'default', 'base' ].some(name => Object.keys(modules).includes(name))) {
			Primate.setupStatusRoute(app);
		}
	}

	/**
	 * Sets up a status route on the provided Express app with a random funny phrase.
	 *
	 * @param {Object} app - An instance of an Express application.
	 * @param {Function} app.get - The Express app's GET method.
	 * @throws {Error} - Throws an error if the app parameter is invalid.
	 */
	static setupStatusRoute(app) {
		// Validate the app parameter
		if(typeof app !== 'function' || typeof app.get !== 'function') {
			throw new Error('App must be a valid Express application instance');
		}

		app.get('/', (req, res) => {
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

			// Send a response with the current time and a random phrase
			res.respond({
				data: {
					framework: 'Primate',
					version: req.primate?.version || '1.0.0',
					time: new Date(),
					uptime: process.uptime(),
					environment: process.env.NODE_ENV || 'development',
				},
				message: phrases[Math.floor(Math.random() * phrases.length)],
			});
		});

		console.info(chalk.green('   🌐 Mounted status route at /'));
	}

	/**
	 * Checks for missing required fields and returns an error if any are missing.
	 *
	 * @param {Object} fields - An object representing the required fields and their values.
	 * @returns {Error|null} - Returns a BadRequest error if any required fields are missing, otherwise returns null.
	 * @throws {Error} - Throws an error if the fields parameter is invalid.
	 */
	static requiredFields(fields = {}) {
		// Validate the field parameter
		if(typeof fields !== 'object' || fields === null) {
			throw new Error('Fields must be a non-null object');
		}

		// If there are no fields, return immediately
		if(!Object.values(fields).length) return null;

		// Filter out missing fields
		const missingFields = Object.keys(fields).filter(field => !fields[field]);

		// If there are missing fields, create and return an error
		if(missingFields.length) {
			const missingFieldsStr = missingFields.join(', ');
			return createError.BadRequest(`Missing required fields: ${ missingFieldsStr }`);
		}

		return null;
	}

	static async validateSchema(entity, data) {
		// get the schema js file from ./entities/{entity}/{entity}.schema.js
		const schemaPath = path.join(process.cwd(), 'entities', pluralize(entity), `${ entity }.schema.js`);

		// if the file does not exist, return true
		if(!fs.existsSync(schemaPath)) {
			console.warn(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Schema file not found for entity "${ entity }"`);
			return data;
		}

		try {
			const schema = await import(`file://${ schemaPath }`);

			if(!schema.default || typeof schema.default.validateAsync !== 'function') {
				throw new Error(`Invalid schema export for entity "${ entity }"`);
			}

			return await schema.default.validateAsync(data, {
				abortEarly: false,  // Get all validation errors
				stripUnknown: true,  // Remove unknown fields
			});

		} catch(error) {
			if(error.isJoi) {
				// Better Joi error formatting
				const details = error.details.map(detail => detail.message).join(', ');
				throw createError.BadRequest(`Validation failed: ${ details }`);
			}
			throw error;
		}
	}

	/**
	 * Generates an ORM object from the Prisma data model.
	 *
	 * @param {Object} Prisma - The Prisma client object.
	 * @returns {Object} ORM object with models and relations.
	 */
	static generatePrismaOrmObject(Prisma) {
		const obj = {};

		if(!Prisma.dmmf) {
			throw new Error('Prisma DMMF is not available.');
		}

		const prismaModels = Prisma.dmmf.datamodel.models;
		for(const model of prismaModels) {
			const modelName = model.name;

			if(modelName) {
				const camelCaseModelName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
				obj[camelCaseModelName] = {};
				for(const field of model.fields) {
					const fieldName = field.name;
					obj[camelCaseModelName][fieldName] = field.type;
				}
			}
		}

		const models = Object.keys(obj);

		models.forEach(model => {
			Primate.addManyToManyRelations(obj, models, model);
			Primate.addOneToManyRelations(obj, models, model);
		});

		return obj;
	};

	/**
	 * Adds many-to-many relations to the model object.
	 *
	 * @param {Object} obj - ORM object with models and fields.
	 * @param {string[]} models - Array of model names.
	 * @param {string} model - Current model name.
	 */
	static addManyToManyRelations(obj, models, model) {
		models.forEach(otherModel => {
			if(model !== otherModel) {
				const otherModelPlural = pluralize(otherModel);
				const otherModelPluralCamelCase = otherModelPlural.charAt(0).toLowerCase() + otherModelPlural.slice(1);
				const modelPlural = pluralize(model);
				const modelPluralCamelCase = modelPlural.charAt(0).toLowerCase() + modelPlural.slice(1);

				if(obj[model][otherModelPluralCamelCase] && obj[otherModel][modelPluralCamelCase]) {
					if(typeof obj[model].relations === 'undefined') {
						obj[model].relations = {};
					}

					obj[model].relations[otherModel] = {
						type: 'many-to-many',
						model: otherModel,
						plural: otherModelPlural,
					};
				}
			}
		});
	};

	/**
	 * Creates a new Express router.
	 * @returns {object} A new Express router instance.
	 */
	static getRouter() {
		return express.Router();
	}

	/**
	 * Sets up routes for a given model using a provided or default router.
	 *
	 * @param {string} model - The name of the model.
	 * @param {Router} router - The Express router to set up routes on.
	 * @param {Object} [options={}] - Optional parameters.
	 */
	static setupRoute(model, router, options = {}) {
		const controller = new PrimateController(model, options);

		// Use custom router if provided, otherwise use the given router
		const routeHandler = options.router || router;
		PrimateService.prepareCrUDAGRoutes(controller, routeHandler, options);
	};

	/**
	 * Adds one-to-many relations to the model object.
	 *
	 * @param {Object} obj - ORM object with models and fields.
	 * @param {string[]} models - Array of model names.
	 * @param {string} model - Current model name.
	 */
	static addOneToManyRelations(obj, models, model) {
		models.forEach(otherModel => {
			if(model !== otherModel) {
				Object.keys(obj[model]).forEach(field => {
					const otherModelCamelCase = otherModel.charAt(0).toUpperCase() + otherModel.slice(1);

					if(field !== 'relations' && field === `id${ otherModelCamelCase }`) {
						Object.keys(obj[otherModel]).forEach(otherField => {
							if(otherField !== 'relations' && otherField === pluralize(model)) {
								if(typeof obj[model].relations === 'undefined') {
									obj[model].relations = {};
								}

								obj[model].relations[otherModel] = {
									type: 'one-to-many',
									model: otherModel,
									field: field,
								};
							}
						});
					}
				});
			}
		});
	};
}

// export Primate class and instance
export default Primate;