import fs from 'fs';
import express from 'express';
import path from 'path';
import pluralize from 'pluralize';
import createError from 'http-errors';
import chalk from 'chalk';

async function importRoutes(directory) {
	const modules = {};

	const routersDir = directory;

	// Read all file names in the directory
	const files = fs.readdirSync(routersDir);

	for(const file of files) {
		// Skip files that are not JavaScript files
		if(path.extname(file) !== '.js') continue;

		// Dynamically import the module
		//const { router } = await import(`../../../../routes/${ file }`);

		const { router } = await import(`file://${ process.cwd() }/${ routersDir }/${ file }`);

		// Add the router to the modules object
		// The key can be the file name or some transformation of it
		const moduleName = path.basename(file, '.js');
		modules[moduleName] = router;
	}

	return modules;
}

async function importEntities(directory) {

	// read each filder in the directory and import the file with the same name as the folder
	// return the imported files as an object

	const entities = {};
	const entitiesDir = directory;

	// Read all file names in the directory
	const files = fs.readdirSync(entitiesDir);

	for(const file of files) {

		try {
			// each file is a directory, read the file with the same name as the directory
			const entityName = file;
			const singular = pluralize.singular(entityName);

			const entityFile = `${ entitiesDir }/${ file }/${ file }.js`;

			// Skip files that are not JavaScript files
			if(path.extname(entityFile) !== '.js') continue;

			// Check if the file exists
			if(!fs.existsSync(entityFile)) {
				throw new Error(`File not found: ${ entityFile }`);
			}

			// Dynamically import the module
			//const { router } = await import(`../../../../routes/${ file }`);
			const { router } = await import(`file://${ process.cwd() }/${ entityFile }`);

			// Add the router to the modules object
			// The key can be the file name or some transformation of it
			entities[entityName] = router;
		} catch(err) {

			console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `There's no route file found for entity "${ file }":`, err.message);
		}
	}

	return entities;
}

function setupRoutes(modules, app) {

	// iterate modules and add it to app
	for(const [ moduleName, router ] of Object.entries(modules)) {

		// If the module name is 'index', 'default' or 'base', add the router to the root of the app
		if([ 'index', 'default', 'base' ].includes(moduleName)) {
			app.use('/', router);
			continue;
		}

		try {
			app.use(`/${ moduleName }`, router);
		} catch(err) {
			console.error(err);
		}
	}

	setupStatusRoute(app);
}

function setupStatusRoute(app) {
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

		return res.respond({
			data: {
				time: new Date(),
			},
			message: phrases[Math.floor(Math.random() * phrases.length)],
		});
	});
}

function requiredFields(fields = {}) {

	if(!Object.values(fields).length) return;
	const missingFields = Object.keys(fields).filter((field) => !fields[field]);

	if(missingFields.length) {

		// string with missing fields
		const missingFieldsStr = Object.keys(fields).join(', ');
		return createError.BadRequest('Missing required fields: ' + missingFieldsStr);
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