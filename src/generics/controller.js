import createError from 'http-errors';
import PrimateService from '../generics/service.js';
import fs from 'fs';
import chalk from 'chalk';
import primate from '../primate.js';
import pluralize from 'pluralize';

/**
 * Generic controller for handling CRUD operations.
 */
export default class PrimateController {

	/**
	 * Creates an instance of PrimateController.
	 *
	 * @param {string} modelName - The name of the model.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Object} [options.service] - The service to be used, if not provided, it will be dynamically imported.
	 */
	constructor(modelName, options = {}) {

		//convert camel case to snake case
		let serviceFileName = modelName.replace(/([A-Z])/g, '-$1').toLowerCase();
		this.singular = serviceFileName;
		this.plural = pluralize(this.singular);

		//remove the _ at the beginning if it starts with one
		if(serviceFileName.charAt(0) === '_') serviceFileName = serviceFileName.substring(1);

		// Dynamically call the service for the model like this: `${modelName}Service` if we don't pass it
		if(!options.service) {
			try {

				// check that file exists
				fs.readFileSync(`./entities/${ this.plural }/${ this.singular }.service.js`);

				// import the service dynamically
				(async () => {
					const { default: dynamicController } = await import(`file://${ process.cwd() }/entities/${ this.plural }/${ this.singular }.service.js`);
					this.service = dynamicController;
				})();

			} catch(e) {
				// Chalk warning
				console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The service "${ this.singular }" was not found in the services directory: ${ e }`);
			}
		} else {

			this.service = options.service;
		}

		this.modelName = modelName;

		// Entity is the model name with the first letter in lowercase
		this.entity = modelName.charAt(0).toLowerCase() + modelName.slice(1);

		this.options = options;
	}

	/**
	 * Get all records.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 * @param {Function} next - Express next middleware function.
	 */
	async all(req, res, next) {

		// Hook all globally
		if(primate.hooks?.all) {
			primate.hooks.all(req, res, next, this.options);
		}

		// Convert query parameters that look like numbers to integers
		for(const key in req.query) {
			if(req.query.hasOwnProperty(key)) {
				// Intentar la conversión a número si el parámetro parece numérico
				const parsedNumber = parseInt(req.query[key]);
				if(!isNaN(parsedNumber)) {
					req.query[key] = parsedNumber;
				}
			}
		}

		// add the current user id to the data
		if(req.user) this.options.user = req.user.payload;

		try {
			if(typeof this.service?.all === 'function') {

				const { count, data } = await this.service.all(req.query, this.options);

				if(data.length === 0) {
					return res.respond({
						status: 404,
						message: this.plural + ' not found',
					});
				}

				res.respond({
					data,
					message: this.modelName + ' retrieved successfully',
					props: { count },
				});
			} else {
				console.log(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.all not found, using PrimateService');

				const { count, data } = await PrimateService.all(this.entity, req.query, this.options);

				if(data.length === 0) {
					return res.respond({
						status: 404,
						message: this.plural + ' not found',
					});
				}

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

	/**
	 * Create a new record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 */
	async create(req, res) {

		const options = { ...this.options };

		// add the current user id to the data
		if(req.user) options.idUser = req.user.payload.id;

		try {

			// remove id from body
			delete req.body.id;

			const service = this.service?.create && typeof this.service?.create === 'function' ? this.service : PrimateService;
			const record = await service.create(req.body, this.entity, options);

			if(typeof this.service?.create !== 'function') {
				console.log(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.create not found, using PrimateService');
			}

			res.respond({
				data: record,
				message: this.modelName + ' created successfully',
			});

		} catch(e) {
			console.log('Error creating ' + this.modelName + ': ' + e.message, e);
			let message = 'Error creating ' + this.modelName + ': ' + e.message;

			if(e.code === 'P2002') {
				message = this.modelName + ' already exists';
			}

			// replace \n with spaces in the message
			message = message.replace(/\n/g, ' ');

			res.respond({
				result: 'error',
				status: 400,
				message,
			});
		}
	}

	/**
	 * Get a single record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} res - Express response object.
	 * @returns {Object} - The response object.
	 */
	async get(req, res) {
		try {
			const service = this.service?.get && this.service?.get === 'function' ? this.service : PrimateService;
			const record = await service.get(req.params.id, this.entity, req.query, this.options);

			if(typeof this.service?.get !== 'function') {
				console.log(chalk.bgBlue.black.italic(' ℹ️ INFO '), this.modelName + 'Service.get not found, using PrimateService');
			}

			if(!record) {
				return res.respond({
					status: 404,
					message: this.modelName + ' not found',
				});
			}

			return res.respond({
				data: record,
				message: this.modelName + ' retrieved successfully',
			});
		} catch(e) {
			console.log('Error retrieving ' + this.modelName + ': ' + e.message, e);
			let message = 'Error retrieving ' + this.modelName + ': ' + e.message;

			return res.respond({
				status: 400,
				message,
			});
		}
	}

	// Update a record
	/**
	 * Updates a record in the database.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to update.
	 * @param {Object} req.body - The data to update.
	 * @param {Object} req.user - The authenticated user object.
	 * @param {Object} res - Express response object.
	 */
	async update(req, res) {
		try {
			const { id } = req.params;
			const data = { ...req.body };
			const { user } = req;
			const { options, entity, service, modelName } = this;

			if(!id) {
				throw new Error('ID is required to update an item.');
			}

			// Add the current user id to the data if available
			if(user) {
				options.idUser = user.payload.id;
			}

			// Remove id from the body to prevent updating the ID
			delete data.id;

			// Fetch the existing record
			let oldRecord;
			if(typeof service?.get === 'function') {
				oldRecord = await service.get(id, options);
			} else {
				oldRecord = await PrimateService.get(id, entity, req.query, options);
			}

			if(!oldRecord) {
				return res.respond({
					status: 404,
					message: `${ modelName } not found`,
				});
			}

			// Update the record
			let updatedRecord;
			if(typeof service?.update === 'function') {
				updatedRecord = await service.update(id, data, options);
			} else {
				updatedRecord = await PrimateService.update(id, data, entity, options);
			}

			res.respond({
				data: updatedRecord,
				message: `${ modelName } updated successfully`,
			});
		} catch(e) {
			console.error(`Error updating ${ this.modelName }:`, e);

			let message = `Error updating ${ this.modelName }: ${ e.message }`;
			if(e.code === 'P2025') {
				message = `Error updating ${ this.modelName }: ${ e.meta.cause }`;
			} else if(e.code === 'P2002') {
				message = `${ this.modelName } already exists`;
			}

			res.respond({
				result: 'error',
				status: 400,
				message,
			});
		}
	}

	/**
	 * Deletes a record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to delete.
	 * @param {Object} res - Express response object.
	 * @returns {Object} - The response object.
	 */
	async delete(req, res) {
		try {

			const { id } = req.params;

			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID is required to delete an item.',
				});
			}

			let record;

			if(typeof this.service?.delete === 'function') {
				record = await this.service.delete(id, this.options);
			} else {
				record = await PrimateService.delete(id, this.entity);
			}

			if(!record) {
				return res.respond({
					status: 404,
					message: this.modelName + ' not found',
				});
			}

			return res.respond({
				data: record,
				message: this.modelName + ' deleted successfully',
			});
		} catch(e) {
			console.error('Error deleting record:', e);
			return res.respond({
				status: 500,
				message: 'Error deleting ' + this.modelName + ': ' + e.message,
			});
		}
	};

	/**
	 * Dynamically calls a service function based on the request.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.body - The body of the request.
	 * @param {Object} res - Express response object.
	 * @throws {Error} If any error occurs during the service call.
	 */
	async serviceCall(req, res) {
		try {
			const { service, functionName } = this;

			if(!service || !functionName) {
				throw new Error('Service and functionName are required.');
			}

			if(typeof service[functionName] !== 'function') {
				throw new Error(`Function "${ functionName }" not found in the service.`);
			}

			// Call the service function dynamically
			const result = await service[functionName](req);

			res.respond({
				data: result,
				message: 'Service called successfully',
			});

		} catch(e) {
			console.error(`Error calling service function "${ this.functionName }":`, e);
			res.respond({
				status: 400,
				message: `Error calling service: ${ e.message }`,
			});
		}
	}

	/**
	 * Updates metadata for a record.
	 *
	 * @param {Object} req - Express request object.
	 * @param {Object} req.params - Request parameters.
	 * @param {string} req.params.id - The ID of the record to update.
	 * @param {Object} req.body - The new metadata to update.
	 * @param {Object} res - Express response object.
	 * @returns {Object} - The response object.
	 */
	async updateMetas(req, res) {
		try {
			const { id } = req.params;
			const data = req.body;

			if(!id) {
				return res.respond({
					status: 400,
					message: 'ID is required to update metadata.',
				});
			}

			if(!data || typeof data !== 'object') {
				return res.respond({
					status: 400,
					message: 'Data must be a non-empty object.',
				});
			}

			const record = await PrimateService.updateMetas(id, data, this.entity);

			if(!record) {
				return res.respond({
					status: 404,
					message: this.modelName + ' not found',
				});
			}

			res.respond({
				data: record,
				message: this.modelName + ' updated successfully',
			});
		} catch(e) {
			console.error('Error updating metadata:', e);
			res.respond({
				status: 500,
				message: 'Error updating metas for ' + this.modelName + ': ' + e.message,
			});
		}
	}
}