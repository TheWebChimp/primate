import createError from 'http-errors';
import PrimateService from '../generics/service.js';
import fs from 'fs';
import chalk from 'chalk';
import primate from '../primate.js';

export default class PrimateController {

	// Pass the plural and singular name of the model
	constructor(modelName, options = {}) {

		//convert camel case to snake case
		let serviceFileName = modelName.replace(/([A-Z])/g, '-$1').toLowerCase();

		//remove the _ at the beginning if it starts with one
		if(serviceFileName.charAt(0) === '_') serviceFileName = serviceFileName.substring(1);

		// Dynamically call the service for the model like this: `${modelName}Service` if we don't pass it
		if(!options.service) {
			try {

				// check that file exists
				const file = fs.readFileSync(`./services/${ serviceFileName }.service.js`);

				// import the service dynamically
				(async () => {
					const { default: dynamicController } = await import(`file://${ process.cwd() }/services/${ serviceFileName }.service.js`);
					this.service = dynamicController;
					// ...
				})();

			} catch(e) {
				// Chalk warning
				console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The service "${ serviceFileName }" was not found in the services directory.`);
			}
		} else this.service = options.service;

		this.modelName = modelName;

		// Entity is the model name with the first letter in lowercase
		this.entity = modelName.charAt(0).toLowerCase() + modelName.slice(1);

		this.options = options;
	}

	// Get all records
	async all(req, res, next) {

		// hook all globally
		if(primate.hooks?.all) {
			primate.hooks.all(req, res, next, this.options);
		}

		// Convert query parameters that look like numbers to integers
		for (const key in req.query) {
			if (req.query.hasOwnProperty(key)) {
				// Intentar la conversión a número si el parámetro parece numérico
				const parsedNumber = parseInt(req.query[key]);
				if (!isNaN(parsedNumber)) {
					req.query[key] = parsedNumber;
				}
			}
		}

		// Pasar el usuario a options si está disponible
		if (req.user) this.options.user = req.user.payload;

		try {
			try {
				const { count, data } = await this.service.all(req.query, this.options);
				res.respond({
					data,
					message: this.modelName + ' retrieved successfully',
					props: { count },
				});
			} catch (e) {
				console.log(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.all not found, using PrimateService');

				const { count, data } = await PrimateService.all(this.entity, req.query, this.options);
				return res.respond({
					data,
					message: this.modelName + ' retrieved successfully',
					props: { count },
				});
			}
		} catch (e) {
			next(createError(401, e.message));
		}
	}

	// Create a new record
	async create(req, res) {

		let record;
		const options = { ...this.options };

		// add the current user id to the data
		if(req.user) options.idUser = req.user.payload.id;

		try {

			// remove id from body
			delete req.body.id;

			try {
				record = await this.service.create(req.body, options);
			} catch(e) {
				record = await PrimateService.create(req.body, this.entity, options);
			}

			// Register the event in the log
			/*await LogService.registerEvent({
				idUser: req.user.payload.id,
				action: 'create',
				description: this.modelName + ' created',
				metas: {
					entity: this.entity,
					record: record,
				},
			});*/

			res.respond({
				data: record,
				message: this.modelName + ' created successfully',
			});

		} catch(e) {
			let message = 'Error creating ' + this.modelName + ': ' + e.message;

			if(e.code === 'P2002') {
				message = this.modelName + ' already exists';
			}

			res.respond({
				result: 'error',
				status: 400,
				message,
			});
		}
	}

	// Get a single record
	async get(req, res) {
		try {

			let record;

			try {
				record = await this.service.get(req.params.id, req.query, this.options);
			} catch(e) {
				record = await PrimateService.get(req.params.id, this.entity, req.query, this.options);
			}

			res.respond({
				data: record,
				message: this.modelName + ' retrieved successfully',
			});

		} catch(e) {
			let message = 'Error retrieving ' + this.modelName + ': ' + e.message;

			res.respond({
				status: 400,
				message,
			});
		}
	};

	// Update a record
	async update(req, res) {
		const options = {};

		try {
			// Remove id from body
			delete req.body.id;

			let oldRecord;
			let record;

			try {
				if(typeof this.service.get === 'function') {
					oldRecord = await this.service.get(req.params.id, this.options);
				} else {
					oldRecord = await PrimateService.get(req.params.id, this.entity, req.query, this.options);
				}

				if(typeof this.service.update === 'function') {
					record = await this.service.update(req.params.id, req.body, this.options);
				} else {
					record = await PrimateService.update(req.params.id, req.body, this.entity, this.options);
				}
			} catch(e) {
				oldRecord = await PrimateService.get(req.params.id, this.entity, req.query, this.options);
				record = await PrimateService.update(req.params.id, req.body, this.entity, this.options);
			}

			res.respond({
				data: record,
				message: this.modelName + ' updated successfully',
			});
		} catch(e) {
			let message = 'Error updating ' + this.modelName + ': ' + e.message;

			if(e.code === 'P2002') {
				message = this.modelName + ' already exists';
			}

			res.respond({
				result: 'error',
				status: 400,
				message,
			});
		}
	};

	// Delete a record
	async delete(req, res) {
		try {
			const record = await PrimateService.delete(req.params.id, this.entity);

			// Register the event in the log
			/*await LogService.registerEvent({
				idUser: req.user.payload.id,
				action: 'delete',
				description: this.modelName + ' deleted',
				metas: {
					entity: this.entity,
					record: record,
				},
			});*/

			res.respond({
				data: record,
				message: this.modelName + ' deleted successfully',
			});
		} catch(e) {
			let message = 'Error deleting ' + this.modelName + ': ' + e.message;

			res.respond({
				status: 400,
				message,
			});
		}
	};

	async serviceCall(req, res) {
		try {
			// call the service dynamically
			const result = await eval(`${ this.service }.${ this.function }`)(req);

			res.respond({
				data: result,
				message: 'Service called successfully',
			});

		} catch(e) {
			let message = 'Error calling service: ' + e.message;

			res.respond({
				status: 400,
				message,
			});
		}
	}

	async updateMetas(req, res) {
		try {
			const record = await PrimateService.updateMetas(req.params.id, req.body, this.entity);

			res.respond({
				data: record,
				message: this.modelName + ' updated successfully',
			});
		} catch(e) {
			let message = 'Error updating metas for ' + this.modelName + ': ' + e.message;

			res.respond({
				result: 'error',
				status: 400,
				message,
			});
		}
	}
}