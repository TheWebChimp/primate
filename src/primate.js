import app from './app.js';
import chalk from 'chalk';
import getPort from 'get-port';
import fs from 'fs';

import { importRoutes, setupRoutes, importEntities } from './utils.js';
import PrimateController from './generics/controller.js';
import PrimateService from './generics/service.js';

import { getRouter, auth, setupRoute } from './route.js';

class Primate {
	constructor(config = {}) {
		this.app = app;
		this.hooks = {};
	}

	use(...args) { this.app.use(...args); }

	async start(port = process.env.PORT) {

		// fallback to 1337 if env.PORT is not set
		if(!port) port = await getPort({ port: [ 1337, 8008, 10101 ] });
		else port = await getPort({ port: [ port, 1337, 8008, 10101 ] });

		// search for a random port if port 1337 is already in use

		this.app.listen(port, () => {
			console.log(chalk.white.bgRgb(204, 0, 0).bold(` 🐵 🙈 🙉 🙊 PRIMATE STARTED 🙊 🙉 🙈 🐵 `));
			console.log(chalk.yellowBright.bgBlack.bold(`Listening on port ${ port }! `));
		});
	}

	async routes(routesDir = './routes') {
		const routes = await importRoutes(routesDir);
		setupRoutes(routes, primate.app);
	}

	async setup(entitiesDir = './entities') {

		// check that the entities directory exists
		// if not, throw an error
		if(!fs.existsSync(entitiesDir)) {
			console.log(chalk.red('Entities directory not found:'), entitiesDir);
			return false;
		}

		const routes = await importEntities(entitiesDir);
		setupRoutes(routes, primate.app);
	}
}

const primate = new Primate();

export default primate;