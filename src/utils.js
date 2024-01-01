import fs from 'fs';
import express from 'express';
import path from 'path';
import primate from './primate.js';

async function importRoutes(directory) {
	const modules = {};

	// Read all file names in the directory
	const files = fs.readdirSync(directory);

	for(const file of files) {
		// Skip files that are not JavaScript files
		if(path.extname(file) !== '.js') continue;

		// Dynamically import the module
		const { router } = await import(`../routes/${ file }`);

		// Add the router to the modules object
		// The key can be the file name or some transformation of it
		const moduleName = path.basename(file, '.js');
		modules[moduleName] = router;
	}

	return modules;
}

function setupRoutes(modules, app) {

	// iterate modules and add it to app
	for(const [ moduleName, router ] of Object.entries(modules)) {

		// If the module name is 'index', 'default' or 'base', add the router to the root of the app
		if([ 'index', 'default', 'base' ].includes(moduleName)) {
			app.use('/', router);
			continue;
		}

		app.use(`/${ moduleName }`, router);
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

// Export the functions
export { importRoutes, setupRoutes };