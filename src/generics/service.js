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

		try {
			data = this.validate(data, 'create');

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
	static async update(id, data, model) {

		try {
			data = this.validate(data, 'update');

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

		// remove deleted elements
		queryObject.where = {
			...options.where || {},
			...queryObject.where,
		};

		if(!!options.filterAllQuery) queryObject = await options.filterAllQuery(query, queryObject);

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
	static async get(id, model, query = {}) {

		const args = {};

		args.where = PrimateService.resolveWhere(id, model);

		// get the "include" parameter from the query
		let include = query.include || null;

		if(include) args.include = include;

		// check if we are fetching a relation via query, it would be of type "fetch_[entity]"
		// check if query has a key that starts with "fetch_"
		const fetch = Object.keys(query).filter(key => key.startsWith('fetch'))[0];

		if(fetch) {
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

		try {
			return await prisma[model].findUnique(args);

		} catch(e) {
			throw e;
		}
	}

	// Other functions -------------------------------------------------------------------------------------------------

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

	static validate(data, method) {
		return data;
	}
}

export default PrimateService;