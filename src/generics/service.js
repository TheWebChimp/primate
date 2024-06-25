import { PrismaOrmObject } from '../prisma/orm.js';
import auth from '../middlewares/auth.js';
import Controller from './controller.js';
import slugify from 'slugify';
import prisma from '../prisma/client.js';
import chalk from 'chalk';

/**
 * Generic service class for handling CRUD operations.
 */
class PrimateService {

	// The functions are in the following order: CrUDAG
	// Create, Update, Delete, All, Get

	// Create ----------------------------------------------------------------------------------------------------------
	/**
	 * Creates a new record in the database.
	 *
	 * @param {Object} data - The data to be created.
	 * @param {string} model - The name of the model.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.filterCreateData] - Function to filter create data.
	 * @param {Object} [options.upsertRules] - Rules for upsert operations.
	 * @returns {Promise<Object>} The created record.
	 * @throws {Error} If any error occurs during creation.
	 */
	static async create(data, model, options = {}) {

		if(!model) throw new Error('Model is required to create an item.');

		// convert the first letter of the model to lowercase
		model = model[0].toLowerCase() + model.slice(1);

		try {

			if(options.filterCreateData) data = await options.filterCreateData(data, model, options);

			// Get the fields of the model
			const modelFields = PrimateService.getORMObject(model);
			const relations = modelFields.relations || null;

			if(relations) {
				// Handle one-to-many and many-to-many relations
				for(const [ relation, relationData ] of Object.entries(relations)) {
					if(relationData.type === 'one-to-many' && !!data[relationData.field]) {
						data[relationData.model] = {
							connect: {
								id: parseInt(data[relationData.field]),
							},
						};

						delete data[relationData.field];
					}

					if(relationData.type === 'many-to-many' && !!data[relationData.plural]) {
						if(Array.isArray(data[relationData.plural])) {
							data[relationData.plural] = {
								connect: data[relationData.plural].map(item =>
									typeof item === 'object' && item.hasOwnProperty('id')
										? { id: parseInt(item.id, 10) }
										: { id: parseInt(item, 10) },
								),
							};
						}
					}
				}
			}

			// Sanitize data to avoid errors
			data = this.sanitizeData(data, model);

			// Handle upsert rules if set
			if(options.upsertRules) {
				for(const [ field, rule ] of Object.entries(options.upsertRules)) {
					if(rule.slugify && data[rule.slugify]) {
						data[field] = slugify(data[rule.slugify], {
							lower: true,
						});
					}
				}
			}

			return await prisma[model].create({ data });

		} catch(e) {
			console.error('Error creating record:', e);
			throw new Error(`Error creating ${ model }: ${ e.message }`);
		}
	}

	// Update ----------------------------------------------------------------------------------------------------------
	/**
	 * Updates a record in the database.
	 *
	 * @param {number|string} id - The ID of the record to update.
	 * @param {Object} data - The data to update.
	 * @param {string} model - The name of the model.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.filterUpdateData] - Function to filter update data.
	 * @param {string} [options.searchField] - Field to search for the record if ID is not a number.
	 * @returns {Promise<Object>} The updated record.
	 * @throws {Error} If any error occurs during the update.
	 */
	static async update(id, data, model, options = {}) {

		if(!id) throw new Error('ID is required to update an item.');
		if(!model) throw new Error('Model is required to update an item.');

		// convert first letter of model to lowercase
		model = model[0].toLowerCase() + model.slice(1);

		try {

			if(options.filterUpdateData) {
				data = await options.filterUpdateData(data, model);
			}

			// Check relations to see if we need to connect
			// first get the fields of the model
			const modelFields = PrismaOrmObject[model];
			const relations = modelFields['relations'] || null;

			if(relations) {
				// iterate over relations
				for(const [ relation, relationData ] of Object.entries(relations)) {
					if(relationData.type === 'one-to-many' && !!data[relationData.field]) {
						data[relationData.model] = {
							connect: {
								id: parseInt(data[relationData.field]),
							},
						};

						delete data[relationData.field];
					}

					if(relationData.type === 'many-to-many' && !!data[relationData.plural]) {
						// check if the relation is an array
						if(Array.isArray(data[relationData.plural])) {

							// get current elements related to the model
							const entity = await prisma[model].findUnique({
								where: { id: parseInt(id) },
								select: {
									[relationData.plural]: true,
								},
							});

							// check if the relation is an array of objects with id
							if(typeof data[relationData.plural][0] === 'object' && data[relationData.plural][0].hasOwnProperty('id')) {

								// generate a list of the elements that need to be disconnected and connected
								const elementsToDisconnect = [];

								// compare the elements in the database with the elements sent
								entity[relationData.plural].forEach(element => {
									// if the user is not in the users sent, we disconnect it
									if(!data[relationData.plural].find((e) => e.id === element.id)) {
										elementsToDisconnect.push({ id: element.id });
									}
								});

								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item.id) })),
								};

								if(elementsToDisconnect.length > 0) data[relationData.plural].disconnect = elementsToDisconnect;

							} else {

								// generate a list of the elements that need to be disconnected and connected
								const elementsToDisconnect = [];

								// compare the elements in the database with the elements sent
								entity[relationData.plural].forEach(element => {
									// if the user is not in the users sent, we disconnect it
									if(!data[relationData.plural].find((e) => e === element.id)) {
										elementsToDisconnect.push({ id: element.id });
									}
								});

								// check if the relation is an array with plain ids
								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item) })),
								};

								if(elementsToDisconnect.length > 0) data[relationData.plural].disconnect = elementsToDisconnect;
							}
						}
					}
				}
			}

			// Sanitize data to avoid errors removing the fields that are not in the model
			data = this.sanitizeData(data, model);

			let where;
			// if option.searchFields exists && id is not a number
			if(options.searchField && isNaN(parseInt(id))) {
				// check if the model has the field
				if(modelFields.hasOwnProperty(options.searchField)) {
					where = {
						[options.searchField]: modelFields[options.searchField].type === 'Int' ? parseInt(id) : id,
					};
				}
			} else {
				where = { id: PrimateService.resolveId(id, model) };
			}

			return await prisma[model].update({ where, data });
		} catch(e) {
			throw e;
		}
	}

	// Delete ----------------------------------------------------------------------------------------------------------
	/**
	 * Deletes a record by its ID from the specified model.
	 *
	 * @param {number|string} id - The ID of the record to delete.
	 * @param {string} model - The name of the model.
	 * @returns {Promise<Object>} The deleted record.
	 * @throws {Error} If any required parameter is missing or an error occurs during deletion.
	 */
	static async delete(id, model) {

		if(!id) throw new Error('ID is required to delete an item.');
		if(!model || typeof model !== 'string') throw new Error('Model is required to delete an item.');

		// Convert the first letter of the model to lowercase
		model = model[0].toLowerCase() + model.slice(1);

		const ormObject = PrimateService.getORMObject(model);
		if(!ormObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		try {
			return await prisma[model].delete({ where: PrimateService.resolveWhere(id, model) });
		} catch(e) {
			console.error(`Error deleting ${ model } with ID ${ id }:`, e);
			throw new Error(`Error deleting ${ model }: ${ e.message }`);
		}
	}

	// All -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a list of records from the specified model based on query parameters.
	 *
	 * @param {string} model - The name of the model.
	 * @param {Object} query - The query parameters.
	 * @param {Object} [options={}] - Optional parameters.
	 * @returns {Promise<Object>} The retrieved records and their count.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async all(model, query, options = {}) {

		if(!model || typeof model !== 'string') {
			throw new Error('Model is required to get items.');
		}

		// Default values for pagination and sorting
		let { page = 1, limit = 100, by = 'id', order = 'desc', q, count: countQuery, select } = query;

		// Prepare the query object
		let queryObject = {
			where: {},
			orderBy: { [by]: order },
		};

		// Handle search query (q)
		if(q) {
			if(options.queryableFields) {
				queryObject.where.OR = [];

				// Add ID to search if it is a number
				if(!isNaN(parseInt(q))) {
					queryObject.where.OR.push({ id: parseInt(q) });
				}

				const modelFields = PrimateService.getORMObject(model);

				options.queryableFields.forEach(field => {
					if(modelFields.hasOwnProperty(field)) {
						queryObject.where.OR.push({ [field]: { contains: q } });
					} else if(field.includes('.')) {
						const [ relation, subfield ] = field.split('.');
						if(modelFields.hasOwnProperty(relation)) {
							queryObject.where.OR.push({ [relation]: { [subfield]: { contains: q } } });
						}
					}
				});
			}
		}

		// Check if we are receiving a query parameter that is in the fields of the model
		// if so, add it to the query

		// iterate over the model fields
		Object.entries(PrismaOrmObject[model]).forEach(([ field ]) => {
			if(query[field]) {
				// check if the field has a comma, if so, split it
				if(query[field].includes(',')) {

					queryObject.where[field] = {
						in: query[field].split(','),
					};
				} else if(query[field].includes('|')) {

					queryObject.where[field] = {
						has: query[field].split('|'),
					};
				} else {

					queryObject.where[field] = query[field];
				}
			}
		});

		// Merge additional where conditions from options
		queryObject.where = {
			...options.where,
			...queryObject.where,
		};

		// Allow customization of the query object
		if(options.filterAllQuery) {
			queryObject = await options.filterAllQuery(query, queryObject, options) || queryObject;
		}

		// Count total records
		const totalCount = await prisma[model].count(queryObject);

		if(countQuery) return { data: [], count: totalCount };

		// Prepare arguments for findMany
		const args = {
			...queryObject,
			skip: (parseInt(page) - 1) * parseInt(limit),
			take: parseInt(limit),
		};

		// Include relations
		if(options.include) {
			args.include = options.include;
		}

		// Handle select fields
		if(select) {
			args.select = {};
			const selectFields = select.includes(',') ? select.split(',') : [ select ];

			selectFields.forEach(field => {
				if(PrismaOrmObject[model].hasOwnProperty(field)) {
					args.select[field] = true;
				} else {
					console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The field "${ field }" is not in the model "${ model }".`);
				}
			});
		}

		// Handle fetch relations via query
		const fetchKey = Object.keys(query).find(key => key.startsWith('fetch-'));
		if(fetchKey) {
			const entity = fetchKey.replace('fetch-', '');
			if(PrismaOrmObject[model].hasOwnProperty(entity)) {
				args.include = { ...args.include, [entity]: true };
			}
		}

		// Retrieve data
		try {
			let data = await prisma[model].findMany(args);
			if(options.filterResultData) {
				data = await options.filterResultData(data, query);
			}
			return { data, count: totalCount };
		} catch(e) {
			console.error(`Error retrieving ${ model }:`, e);
			throw new Error(`Error retrieving ${ model }: ${ e.message }`);
		}
	}

	// Get -------------------------------------------------------------------------------------------------------------
	/**
	 * Retrieves a record from the database based on the given ID and model.
	 *
	 * @param {number|string} id - The ID of the record to retrieve.
	 * @param {string} model - The name of the model.
	 * @param {Object} [query={}] - The query parameters.
	 * @param {Object} [options={}] - Optional parameters.
	 * @param {Function} [options.resolveWhere] - Function to resolve the where clause.
	 * @param {string[]} [options.searchField] - Fields to search if ID is not a number.
	 * @param {Function} [options.filterGetItem] - Function to filter the retrieved item.
	 * @returns {Promise<Object|null>} The retrieved record, or null if no record is found.
	 * @throws {Error} If any required parameter is missing or an error occurs during retrieval.
	 */
	static async get(id, model, query = {}, options = {}) {

		if(!id) throw new Error('ID is required to get an item.');
		if(!model || typeof model !== 'string') throw new Error('Model is required to get an item.');

		// Convert the first letter of the model to lowercase
		model = model[0].toLowerCase() + model.slice(1);

		const modelFields = PrismaOrmObject[model];
		if(!modelFields) throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);

		const args = {};

		if(options.resolveWhere) {
			args.where = options.resolveWhere(id, model);
		} else {
			if(options.searchField && isNaN(parseInt(id, 10))) {
				const toSearch = options.searchField
					.filter(field => modelFields.hasOwnProperty(field))
					.map(field => ({
						[field]: modelFields[field].type === 'Int' ? parseInt(id, 10) : id,
					}));

				if(toSearch.length === 1) {
					args.where = toSearch[0];
				} else {
					args.where = { OR: toSearch };
				}
			} else {
				args.where = PrimateService.resolveWhere(id, model);
			}
		}

		// Get the "include" parameter from the query
		const include = query.include || null;
		if(include) {
			args.include = include;
		}

		// Check if we are fetching a relation via query
		const fetchs = Object.keys(query).filter(key => key.startsWith('fetch-'));
		fetchs.forEach(fetch => {
			const entity = fetch.replace('fetch-', '');
			if(modelFields.hasOwnProperty(entity)) {
				args.include = {
					...args.include,
					[entity]: true,
				};
			}
		});

		try {
			let get = await prisma[model].findFirst(args);
			if(options.filterGetItem) {
				get = await options.filterGetItem(get, query);
			}
			return get;
		} catch(e) {
			console.error(`Error retrieving ${ model } with ID ${ id }:`, e);
			throw new Error(`Error retrieving ${ model }: ${ e.message }`);
		}
	}

	// Other functions -------------------------------------------------------------------------------------------------

	/**
	 * Sanitizes the data by removing fields that are not in the model.
	 *
	 * @param {Object} data - The data to be sanitized.
	 * @param {string} model - The name of the model.
	 * @returns {Object} The sanitized data.
	 * @throws {Error} If the model is not found or the parameters are invalid.
	 */
	static sanitizeData(data, model) {
		// Validate parameters
		if(!data || typeof data !== 'object') {
			throw new Error('The "data" parameter must be a non-empty object.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const modelObject = PrismaOrmObject[model];
		if(!modelObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		// Sanitize data by removing fields that are not in the model
		for(const [ field, value ] of Object.entries(data)) {
			if(!modelObject.hasOwnProperty(field)) {
				delete data[field];
				// Log a warning
				console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The field "${ field }" is not in the model "${ model }".`);
			}
		}

		return data;
	}

	/**
	 * Prepares CRUD and additional routes for a given model.
	 *
	 * @param {Express.Router} router - The Express router.
	 * @param {string|Object} model - The model name or an instance of a model controller.
	 */
	static prepareCrUDAGRoutes(router, model) {
		if(!router || typeof router !== 'function' || typeof router.get !== 'function') {
			throw new Error('A valid Express router is required.');
		}
		if(!model) {
			throw new Error('Model is required to prepare routes.');
		}

		const controller = typeof model === 'string' ? new Controller(model) : model;

		router.get('/crudag', (req, res) => res.status(200).send('OK'));
		router.post('/', auth, controller.create.bind(controller));
		router.put('/:id', auth, controller.update.bind(controller));
		router.delete('/:id', auth, controller.delete.bind(controller));
		router.get('/', auth, controller.all.bind(controller));
		router.get('/:id', auth, controller.get.bind(controller));
		router.put('/:id/metas', auth, controller.updateMetas.bind(controller));
	}

	/**
	 * Updates the metadata for a record in the database.
	 *
	 * @param {number|string} id - The ID of the record to update.
	 * @param {Object} metas - The new metadata to update.
	 * @param {string} model - The name of the model.
	 * @returns {Promise<Object>} The updated record.
	 * @throws {Error} If any error occurs during the update.
	 */
	static async updateMetas(id, metas, model) {

		if(!id) {
			throw new Error('ID is required to update metadata.');
		}
		if(!metas || typeof metas !== 'object') {
			throw new Error('The "metas" parameter must be a non-empty object.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		try {
			// Get the current metadata from the model
			const currentMetas = await prisma[model].findUnique({
				where: PrimateService.resolveWhere(id, model),
				select: { metas: true },
			});

			if(!currentMetas) {
				throw new Error(`${ model } with ID ${ id } not found.`);
			}

			// Merge the current metadata with the new metadata
			const mergedMetas = {
				...currentMetas.metas,
				...metas,
			};

			// Update the metadata
			return await prisma[model].update({
				where: PrimateService.resolveWhere(id, model),
				data: { metas: mergedMetas },
			});
		} catch(e) {
			console.error(`Error updating metadata for ${ model } with ID ${ id }:`, e);
			throw new Error(`Error updating metadata: ${ e.message }`);
		}
	}

	/**
	 * Resolves the where clause for a given ID and model.
	 *
	 * @param {number|string} id - The ID of the record.
	 * @param {string} model - The name of the model.
	 * @returns {Object} The where clause for querying the database.
	 * @throws {Error} If the model is not found or the ID is invalid.
	 */
	static resolveWhere(id, model) {
		if(!id) {
			throw new Error('ID is required to resolve where clause.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const modelObject = PrismaOrmObject[model];
		if(!modelObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		// check if id is a number
		let where = {};

		if(isNaN(parseInt(id, 10))) {
			// Check if the model has a field called uid
			if(modelObject.hasOwnProperty('uid')) {
				where = { uid: id };
			} else {
				throw new Error(`Model "${ model }" does not have a "uid" field.`);
			}
		} else {
			where = { id: PrimateService.resolveId(id, model) };
		}

		return where;
	}

	/**
	 * Retrieves the ORM object for a given model.
	 *
	 * @param {string} model - The name of the model.
	 * @returns {Object} The ORM object for the specified model.
	 * @throws {Error} If the model is not found in PrismaOrmObject.
	 */
	static getORMObject(model) {
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const ormObject = PrismaOrmObject[model];
		if(!ormObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		return ormObject;
	}

	/**
	 * Resolves the ID for a given model based on its type.
	 *
	 * @param {number|string} id - The ID of the record.
	 * @param {string} model - The name of the model.
	 * @returns {number|string} The resolved ID.
	 * @throws {Error} If the model is not found or the ID type is invalid.
	 */
	static resolveId(id, model) {
		if(!id) {
			throw new Error('ID is required to resolve.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const orm = PrimateService.getORMObject(model);
		if(!orm) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		if(orm.id === 'Int') {
			const parsedId = parseInt(id, 10);
			if(isNaN(parsedId)) {
				throw new Error(`ID "${ id }" is not a valid integer.`);
			}
			return parsedId;
		} else {
			return id;
		}
	}

	/**
	 * Finds a unique record in the database based on the provided criteria.
	 *
	 * @param {Object} where - The criteria to find the record.
	 * @param {string} model - The name of the model.
	 * @param {Object} [params={}] - Optional parameters.
	 * @returns {Promise<Object|null>} The found record, or null if no record is found.
	 * @throws {Error} If any error occurs during the query.
	 */
	static async findBy(where, model, params = {}) {
		if(!where || typeof where !== 'object') throw new Error('The "where" parameter must be a non-empty object.');
		if(!model || typeof model !== 'string') throw new Error('The "model" parameter must be a non-empty string.');

		try {
			return await prisma[model].findFirst({
				where,
				...params,
			});
		} catch(e) {
			console.error(`Error finding ${ model } with criteria ${ JSON.stringify(where) }:`, e);
			throw new Error(`Error finding ${ model }: ${ e.message }`);
		}
	}

	/**
	 * Finds a record by its ID or UID in the specified model.
	 *
	 * @param {number|string} id - The ID of the record.
	 * @param {string} model - The name of the model.
	 * @returns {Promise<Object|null>} The found record, or null if no record is found.
	 * @throws {Error} If the model is not found or an error occurs during the query.
	 */
	static async findById(id, model) {
		if(!id) {
			throw new Error('ID is required to find a record.');
		}
		if(!model || typeof model !== 'string') {
			throw new Error('The "model" parameter must be a non-empty string.');
		}

		const ormObject = PrimateService.getORMObject(model);
		if(!ormObject) {
			throw new Error(`Model "${ model }" not found in PrismaOrmObject.`);
		}

		try {
			return await prisma[model].findUnique({
				where: PrimateService.resolveWhere(id, model),
			});
		} catch(e) {
			console.error(`Error finding ${ model } with ID ${ id }:`, e);
			throw new Error(`Error finding ${ model }: ${ e.message }`);
		}
	}
}

export default PrimateService;