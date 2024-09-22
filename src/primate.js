import express from 'express';
import chalk from 'chalk';
import getPort from 'get-port';
import createError from 'http-errors';
import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';

import app from './app.js';
import PrimateService from './generics/service.js';
import PrimateController from './generics/controller.js';

/**
 * Class representing the Primate application.
 */
class Primate {

	static prisma = null;
	static app = null;
	static orm = null;

	/**
	 * Create a new Primate application.
	 * @constructor
	 */
	constructor() {
		this.app = app;
		this.hooks = {};
		this.prisma = null;
		this.orm = null;
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
	 * @param {string|number} [port=process.env.PORT] - The port to listen on.
	 */
	async start(port = process.env.PORT) {
		// Fallback to a list of ports if env.PORT is not set
		const ports = port ? [ port, 1337, 8008, 10101 ] : [ 1337, 8008, 10101 ];
		port = await getPort({ port: ports });

		this.app.listen(port, () => {
			console.log(chalk.white.bgRgb(204, 0, 0).bold(` 🐵 🙈 🙉 🙊 PRIMATE STARTED 🙊 🙉 🙈 🐵 `));
			console.log(chalk.yellowBright.bgBlack.bold(`Listening on port ${ port }! `));
		});
	}

	/**
	 * Set up routes from a directory.
	 * @param {string} [routesDir='./routes'] - The directory containing route files.
	 */
	async routes(routesDir = './routes') {
		try {
			const routes = await Primate.importRoutes(routesDir);
			Primate.setupRoutes(routes, this.app);
		} catch(error) {
			console.error(chalk.red(`Error setting up routes from ${ routesDir }:`), error);
		}
	}

	/**
	 * Set up entities from a directory.
	 * @param {Object} [config={}] - The configuration object.
	 * @param {string} [config.entitiesDir='./entities'] - The directory containing entity folders.
	 * @param {string} [config.prismaClientLocation='@prisma/client'] - The location of the Prisma client.
	 * @param {boolean} [config.usePrisma=false] - Whether to use Prisma.
	 * @throws {Error} - Throws an error if the entities directory is not found, or if any other error occurs during the setup process.
	 * @returns {Promise<void>} - A promise that resolves when the setup is complete.
	 */
	async setup(config = {}) {

		const entitiesDir = config.entitiesDir || './entities';
		const prismaClientLocation = config.prismaClientLocation || '@prisma/client';
		const usePrisma = typeof config.usePrisma === 'boolean' ? config.usePrisma : true;

		// Check that the entities directory exists
		if(!fs.existsSync(entitiesDir)) {
			console.log(chalk.red('Entities directory not found:'), entitiesDir);
		}

		// import the Prisma client based on the location provided
		if(usePrisma) {

			let prismaClient;
			try {
				prismaClient = await import(prismaClientLocation);
				console.log(chalk.green('⚠️💎 Prisma client imported successfully'));
				this.prisma = new prismaClient.PrismaClient();
				Primate.prisma = this.prisma;

			} catch(error) {
				console.error(chalk.red('Error importing Prisma client:'), error);
				throw new Error(`Error importing Prisma client: ${ error.message }`);
			}

			try {

				let PrismaOrmObject = null;
				PrismaOrmObject = Primate.generatePrismaOrmObject(prismaClient.Prisma);
				this.orm = PrismaOrmObject;
				Primate.orm = this.orm;

				PrimateService.initialize(this.prisma, this.orm);

			} catch(error) {
				console.error(chalk.red('Error initializing Prisma service:'), error);
				throw new Error(`Error initializing Prisma service: ${ error.message }`);
			}

			try {
				const entities = await Primate.importEntities(entitiesDir);
				Primate.setupRoutes(entities, this.app);

			} catch(error) {
				console.error(chalk.red(`Error setting up entities from ${ entitiesDir }:`), error);
				throw new Error(`Error setting up entities from ${ entitiesDir }: ${ error.message }`);
			}
		} else {
			console.info(chalk.yellow('⚠️💎 Prisma is not enabled'));
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
			// Read all file names in the directory
			const files = fs.readdirSync(directory);

			for(const file of files) {
				// Skip files that are not JavaScript files
				if(path.extname(file) !== '.js') continue;

				// Dynamically import the module
				const { router } = await import(`file://${ process.cwd() }/${ directory }/${ file }`);

				// Add the router to the modules object
				const moduleName = path.basename(file, '.js');
				modules[moduleName] = router;
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
						throw new Error(`File not found: ${ entityFile }`);
					}

					// Dynamically import the module
					const { router } = await import(`file://${ process.cwd() }/${ entityFile }`);

					// Add the router to the entities object
					entities[entityName] = router;
				} catch(err) {
					console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Error found inside entity "${ file }":`, err.name, err.message);
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
				console.error(`Router for module "${ moduleName }" is not a valid function`);
				continue;
			}

			// If the module name is 'index', 'default' or 'base', add the router to the root of the app
			if([ 'index', 'default', 'base' ].includes(moduleName)) {
				app.use('/', router);
				continue;
			}

			try {
				app.use(`/${ moduleName }`, router);
			} catch(err) {
				console.error(`Failed to setup route for module "${ moduleName }":`, err);
			}
		}

		// Set up a status route
		Primate.setupStatusRoute(app);
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
				'Primate is running more efficiently than a Swiss watch on New Year’s Eve.',
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
					time: new Date(),
				},
				message: phrases[Math.floor(Math.random() * phrases.length)],
			});
		});
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
			console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Schema file not found for entity "${ entity }"`);
			return data;
		}

		// import the schema file
		const schema = await import(`file://${ schemaPath }`);

		// check that schema is a Joi object
		if(typeof schema.default !== 'object') {
			console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `Schema file for entity "${ entity }" does not export a Joi object`);
			return data;
		}

		try {
			// validate the data against the schema
			return await schema.default.validateAsync(data);

		} catch(error) {
			throw createError.BadRequest(`Schema validation failed: ${ error.message }`);
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
	 * @param {express.Router} router - The Express router to set up routes on.
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