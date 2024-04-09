import app from './app.js';
import chalk from 'chalk';
import getPort from 'get-port';

import { importRoutes, setupRoutes } from './utils.js';
import PrimateController from './generics/controller.js';
import PrimateService from './generics/service.js';

import { getRouter, auth, setupRoute } from './route.js';

class Primate {
	constructor(config = {}) {
		this.app = app;
		this.hooks = {};
	}

	use(...args) { this.app.use(...args); }

	async start({ port = process.env.PORT, config = {} } = {}) {

		// fallback to 1337 if env.PORT is not set
		if(!port) port = await getPort({ port: [ 1337, 8008, 10101 ] });
		else port = await getPort({ port: [ port, 1337, 8008, 10101 ] });

		// search for a random port if port 1337 is already in use

		const server = this.app.listen(port, () => {
			console.log(chalk.white.bgRgb(204, 0, 0).bold(` 🐵 🙈 🙉 🙊 PRIMATE STARTED 🙊 🙉 🙈 🐵 `));
			console.log(chalk.yellowBright.bgBlack.bold(`Listening on port ${ port }! `));
		});

		if (config && typeof config.timeout === 'number') {
			server.setTimeout(config.timeout);
		}
	}

	async routes(routesDir = './routes') {
		const routes = await importRoutes(routesDir);
		setupRoutes(routes, primate.app);
	}
}

const primate = new Primate();

export default primate;