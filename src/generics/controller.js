import createError from 'http-errors';
import PrimateService from '../generics/service.js';
import fs from 'fs';
import chalk from 'chalk';

//import LogService from '../generics/log.service.js';

class PrimateController {

	// Pass the plural and singular name of the model
	constructor(modelName, options = {}) {

		//convert camel case to snake case
		let serviceFileName = modelName.replace(/([A-Z])/g, '-$1').toLowerCase();

		//remove the _ at the beginning
		serviceFileName = serviceFileName.substring(1);

		// Dynamically call the service for the model like this: `${modelName}Service` if we don't pass it
		if(!options.service) {
			try {

				// check that file exists
				fs.readFileSync(`./services/${ serviceFileName }.service.js`);

				// import the service dynamically
				(async () => {
					const { default: dynamicController } = await import(`../../services/${ serviceFileName }.service.js`);
					this.service = dynamicController;
					// ...
				})();

			} catch(e) {
				console.log('error importing service dynamically', e);
			}
		} else this.service = options.service;

		this.modelName = modelName;

		// Entity is the model name with the first letter in lowercase
		this.entity = modelName.charAt(0).toLowerCase() + modelName.slice(1);

		this.options = options;
	}

	// Get all records
	async all(req, res, next) {

		// get headers
		const headers = req.headers;

		// check if we are receiving id-workspace in the headers
		if(headers['id-workspace']) req.query.idWorkspace = headers['id-workspace'];

		try {
			try {
				const { count, data } = await this.service.all(req.query);
				res.respond({
					data,
					message: this.modelName + ' retrieved successfully',
					props: { count },
				});

			} catch(e) {
				console.log(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.all not found, using PrimateService');

				const { count, data } = await PrimateService.all(this.entity, req.query, this.options);
				return res.respond({
					data,
					message: this.modelName + ' retrieved successfully',
					props: { count },
				});
			}

		} catch(e) {
			next(createError(401, e.message));
		}
	}

	// Create a new record
	async create(req, res) {

		let record;
		const options = { ...this.options };

		// add the current user id to the data
		if(req.user) {
			options.idUser = req.user.payload.id;
		}

		try {

			// remove id from body
			delete req.body.id;

			console.log('this service', this.service);

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
				record = await this.service.get(req.params.id, req.query);
			} catch(e) {
				record = await PrimateService.get(req.params.id, this.entity, req.query);
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

			if(typeof this.service.get === 'function' || typeof this.service.update === 'function') {
				if(typeof this.service.get === 'function') {
					oldRecord = await this.service.get(req.params.id);
				} else {
					oldRecord = await PrimateService.get(req.params.id, this.entity, req.query);
				}
				record = await this.service.update(req.params.id, req.body);
			} else {
				oldRecord = await PrimateService.get(req.params.id, this.entity, req.query);
				record = await PrimateService.update(req.params.id, req.body, this.entity, options);
			}

			// Register the event in the log
			/*await LogService.registerEvent({
				idUser: req.user.payload.id,
				action: 'update',
				description: this.modelName + ' updated',
				metas: {
					entity: this.entity,
					record: record,
					oldRecord: oldRecord,
				},
			});*/

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

			// Register the event in the log
			/*await LogService.registerEvent({
				idUser: req.user.payload.id,
				action: 'update',
				description: this.modelName + ' updated',
				metas: {
					entity: this.entity,
					record: record,
				},
			});*/

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

export default PrimateController;