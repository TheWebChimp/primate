import fs from 'fs';
import express from 'express';
import path from 'path';
import createError from 'http-errors';
import chalk from 'chalk';

/**
 * Asynchronously imports route modules from a specified directory.
 *
 * @param {string} directory - The directory containing route modules.
 * @returns {Promise<Object>} - A promise that resolves to an object containing the imported route modules.
 * @throws {Error} - Throws an error if the directory parameter is missing or invalid, or if any other error occurs during the import process.
 */
async function importRoutes(directory) {
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
async function importEntities(directory) {
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
				console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `There's no route file found for entity "${ file }":`, err.message);
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
function setupRoutes(modules, app) {
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
	setupStatusRoute(app);
}

/**
 * Sets up a status route on the provided Express app with a random funny phrase.
 *
 * @param {Object} app - An instance of an Express application.
 * @throws {Error} - Throws an error if the app parameter is invalid.
 */
function setupStatusRoute(app) {
	// Validate the app parameter
	if(typeof app !== 'function' || typeof app.get !== 'function') {
		throw new Error('App must be a valid Express application instance');
	}

	const router = express.Router();

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
function requiredFields(fields = {}) {
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

// Export the functions
export {
	importRoutes,
	setupRoutes,
	importEntities,
	requiredFields,
};