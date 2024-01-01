import app from './app.js';
import chalk from 'chalk';
import getPort from 'get-port';

import { importRoutes, setupRoutes } from './utils.js';

class Primate {
	constructor({ routes }) {
		this.app = app;

		// Import all routes from the routes directory
		this.routes = routes;

		if(!!this.routes && typeof this.routes !== 'object') throw new Error('Routes must be an object');

		// Setup all routes
		if(!!this.routes) setupRoutes(this.routes, this.app);
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
}

const routes = await importRoutes('./routes');
const primate = new Primate({ routes });

export default primate;