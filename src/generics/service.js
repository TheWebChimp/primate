import { PrismaOrmObject } from '../prisma/orm.js';
import auth from '../middlewares/auth.js';
import Controller from './controller.js';
import slugify from 'slugify';
import prisma from '../prisma/client.js';
import chalk from 'chalk';

class PrimateService {

	// The functions are in the following order: CrUDAG
	// Create, Update, Delete, All, Get

	// Create ----------------------------------------------------------------------------------------------------------
	static async create(data, model, options) {

		if(!model) throw new Error('Model is required to create an item.');

		try {

			if(options.filterCreateData) data = await options.filterCreateData(data, model, options);

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
						// check if the relation is an object
						if(Array.isArray(data[relationData.plural])) {

							// check if the relation is an array of objects with id
							if(typeof data[relationData.plural][0] === 'object' && data[relationData.plural][0].hasOwnProperty('id')) {

								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item.id) })),
								};

							} else {
								// check if the relation is an array with plain ids
								data[relationData.plural] = {
									connect: data[relationData.plural].map((item) => ({ id: parseInt(item) })),
								};
							}
						}
					}
				}
			}

			// Sanitize data to avoid errors removing the fields that are not in the model
			data = this.sanitizeData(data, model);

			// Check if options.upsertRules is set
			if(options && options.upsertRules) {
				// iterate over the rules
				for(const [ field, rule ] of Object.entries(options.upsertRules)) {
					// slugify
					if(rule.slugify) {
						// check if the field exists
						if(data[rule.slugify]) {
							// slugify the field
							data[field] = slugify(data[rule.slugify], {
								lower: true,
							});
						}
					}
				}
			}

			return await prisma[model].create({
				data,
			});

		} catch(e) {
			throw e;
		}
	}

	// Update ----------------------------------------------------------------------------------------------------------
	static async update(id, data, model, options) {

		if(!id) throw new Error('ID is required to update an item.');
		if(!model) throw new Error('Model is required to update an item.');

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

			return await prisma[model].update({
				where: { id: parseInt(id) },
				data,
			});
		} catch(e) {
			throw e;
		}
	}

	// Delete ----------------------------------------------------------------------------------------------------------
	static async delete(id, model) {
		try {
			return await prisma[model].delete({ where: { id: parseInt(id) } });
		} catch(e) {
			throw e;
		}
	}

	// All -------------------------------------------------------------------------------------------------------------
	static async all(model, query, options = {}) {

		// Query param
		let { page, limit, by, order, q } = query;

		// if the page is not set, set it to 1
		page = page || 1;

		// if the limit is not set, set it to 10
		limit = limit || 100;

		order = order || 'desc';
		by = by || 'id';

		// If we have params, prepare them for the query
		let queryObject = {
			where: {},
		};

		if(by && order) {
			queryObject.orderBy = {
				[by]: order,
			};
		}

		if(q) {
			// check there are queryable fields
			if(options.queryableFields) {
				queryObject.where = {
					OR: [],
				};

				// if id is not nan, add it to the query
				if(!isNaN(parseInt(q))) {
					queryObject.where.OR.push({
						id: parseInt(q),
					});
				}

				options.queryableFields.forEach(field => {
					queryObject.where.OR.push({
						[field]: {
							contains: q,
						},
					});
				});
			}
		}

		// Check if we are receiving a query parameter that is in the fields of the model
		// if so, add it to the query

		// iterate over the model fields
		for(const [ field, value ] of Object.entries(PrismaOrmObject[model])) {
			// check if the query has a field that matches the model field
			if(query[field]) {
				// add the field to the query
				queryObject.where[field] = query[field];
			}
		}

		// remove deleted elements
		queryObject.where = {
			...options.where || {},
			...queryObject.where,
		};

		if(!!options.filterAllQuery) {
			const filterAllQueryObject = await options.filterAllQuery(query, queryObject, options);
			if(filterAllQueryObject) queryObject = filterAllQueryObject;
		}

		// Get count of all courses under the query
		const count = await prisma[model].count(queryObject);

		if(query.count) return { data: [], count };

		const args = {
			...queryObject,
			skip: (parseInt(page) - 1) * parseInt(limit),
			take: parseInt(limit),
		};

		if(options.include) args.include = options.include;

		if(query.select) {

			args.select = {};

			// check if select is a comma separated string
			if(query.select.includes(',')) {
				query.select = query.select.split(',');
			}

			// iterate PrismaOrmObject[model] and remove from query.select
			// the fields that are in the select but are not in the model
			query.select.forEach(field => {
				if(!PrismaOrmObject[model].hasOwnProperty(field)) {
					query.select.splice(query.select.indexOf(field), 1);
					// log a warning
					console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The field "${ field }" is not in the model "${ model }".`);
				}
			});

			query.select.forEach(field => { args.select[field] = true; });
		}

		// check if we are fetching a relation via query, it would be of type "fetch_[entity]"
		// check if the query has a key that starts with "fetch_"
		const fetch = Object.keys(query).filter(key => key.startsWith('fetch-'))[0];

		if(fetch) {
			// remove the "fetch_" part
			const entity = fetch.replace('fetch-', '');
			// check if the entity exists
			if(PrismaOrmObject[model].hasOwnProperty(entity)) {
				// add the entity to the "include"
				args.include = {
					...args.include,
					[entity]: true,
				};
			}
		}

		// Get courses under the query
		try {

			let data = await prisma[model].findMany(args);

			if(!!options.filterResultData) data = await options.filterResultData(data, query);

			return {
				data,
				count,
			};
		} catch(e) {
			console.log(e);
		}

	}

	// Get -------------------------------------------------------------------------------------------------------------
	static async get(id, model, query = {}, options = {}) {

		const args = {};

		if(!model) throw new Error('Model is required to get an item.');

		if(options.resolveWhere) args.where = options.resolveWhere(id, model);
		else args.where = PrimateService.resolveWhere(id, model);

		// get the "include" parameter from the query
		let include = query.include || null;

		if(include) args.include = include;

		// check if we are fetching a relation via query, it would be of type "fetch_[entity]"
		// check if query has a key that starts with "fetch_"
		const fetchs = Object.keys(query).filter(key => key.startsWith('fetch'));

		if(fetchs) {
			for(const fetch of fetchs) {
				// remove the "fetch_" part
				const entity = fetch.replace('fetch-', '');
				// check if the entity exists
				if(PrismaOrmObject[model].hasOwnProperty(entity)) {
					// add the entity to the include
					args.include = {
						...args.include,
						[entity]: true,
					};
				}
			}
		}

		try {
			let get = await prisma[model].findUnique(args);
			if(!!options.filterGetItem) get = await options.filterGetItem(get, query);
			return get;

		} catch(e) {
			throw e;
		}
	}

	// Other functions -------------------------------------------------------------------------------------------------

	static sanitizeData(data, model) {

		// Sanitize data to avoid errors removing the fields that are not in the model
		for(const [ field, value ] of Object.entries(data)) {
			if(!PrismaOrmObject[model].hasOwnProperty(field)) {
				delete data[field];
				// log a warning
				console.log(chalk.bgYellow.black.italic(' ⚠️ WARNING '), `The field "${ field }" is not in the model "${ model }".`);
			}
		}

		return data;

	}

	// Receive router by reference
	static prepareCrUDAGRoutes(router, model) {

		if(typeof model === 'string') {

			const controller = new Controller(model);

			router.get('/crudag', (req, res) => res.send('OK').status(200));
			router.post('/', auth, controller.create.bind(controller));
			router.put('/:id', auth, controller.update.bind(controller));
			router.delete('/:id', auth, controller.delete.bind(controller));
			router.get('/', auth, controller.all.bind(controller));
			router.get('/:id', auth, controller.get.bind(controller));
			router.put('/:id/metas', auth, controller.updateMetas.bind(controller));

		} else {

			router.get('/crudag', (req, res) => res.send('OK').status(200));
			router.post('/', auth, model.create.bind(model));
			router.put('/:id', auth, model.update.bind(model));
			router.delete('/:id', auth, model.delete.bind(model));
			router.get('/', auth, model.all.bind(model));
			router.get('/:id', auth, model.get.bind(model));
			router.put('/:id/metas', auth, model.updateMetas.bind(model));
		}
	}

	static async updateMetas(id, metas, model) {

		// get the metas from the model
		const currentMetas = await prisma[model].findUnique({
			where: { id: parseInt(id) },
			select: {
				metas: true,
			},
		});

		// merge the metas
		const mergedMetas = {
			...currentMetas.metas,
			...metas,
		};

		// update the metas
		return prisma[model].update({
			where: { id: parseInt(id) },
			data: {
				metas: mergedMetas,
			},
		});
	}

	static resolveWhere(id, model) {
		// check if id is a number
		let where = {};

		if(isNaN(parseInt(id))) {
			// check if the model has a field called uid
			if(typeof PrismaOrmObject[model].uid !== 'undefined') {
				where = { uid: id };
			}
		} else {
			where = { id: parseInt(id) };
		}

		return where;
	}

	static findById(id, model) {
		return prisma[model].findUnique({
			where: { id },
		});
	}
}

export default PrimateService;