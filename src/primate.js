import app from './app.js';
import chalk from 'chalk';
import getPort from 'get-port';
import fs from 'fs';

import { importRoutes, setupRoutes, importEntities } from './utils.js';
import PrimateController from './generics/controller.js';
import PrimateService from './generics/service.js';

import { getRouter, auth, setupRoute } from './route.js';

/**
 * Class representing the Primate application.
 */
class Primate {
	constructor(config = {}) {
		this.app = app;
		this.hooks = {};
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
	 * @param {number} [port=process.env.PORT] - The port to listen on.
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
			const routes = await importRoutes(routesDir);
			setupRoutes(routes, this.app);
		} catch(error) {
			console.error(chalk.red(`Error setting up routes from ${ routesDir }:`), error);
		}
	}

	/**
	 * Set up entities from a directory.
	 * @param {string} [entitiesDir='./entities'] - The directory containing entity files.
	 * @returns {boolean} Whether the setup was successful.
	 */
	async setup(entitiesDir = './entities') {
		// Check that the entities directory exists
		if(!fs.existsSync(entitiesDir)) {
			console.log(chalk.red('Entities directory not found:'), entitiesDir);
			return false;
		}

		try {
			const entities = await importEntities(entitiesDir);
			setupRoutes(entities, this.app);
			return true;
		} catch(error) {
			console.error(chalk.red(`Error setting up entities from ${ entitiesDir }:`), error);
			return false;
		}
	}
}

// Instantiate and export a Primate instance
const primate = new Primate();
export default primate;