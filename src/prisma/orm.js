import pluralize from 'pluralize';
import { Prisma } from '@prisma/client';
import chalk from 'chalk';

/**
 * Generates an ORM object from the Prisma data model.
 *
 * @returns {Object} ORM object with models and relations.
 */
const generatePrismaOrmObject = () => {
	const obj = {};

	if(!Prisma.dmmf) {
		throw new Error('Prisma DMMF is not available.');
	}

	const prismaModels = Prisma.dmmf.datamodel.models;
	for(const model of prismaModels) {
		const modelName = model.name;

		if(modelName) {
			const camelCaseModelName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
			obj[camelCaseModelName] = {};
			for(const field of model.fields) {
				const fieldName = field.name;
				obj[camelCaseModelName][fieldName] = field.type;
			}
		}
	}

	const models = Object.keys(obj);

	models.forEach(model => {
		addManyToManyRelations(obj, models, model);
		addOneToManyRelations(obj, models, model);
	});

	return obj;
};

/**
 * Adds many-to-many relations to the model object.
 *
 * @param {Object} obj - ORM object with models and fields.
 * @param {string[]} models - Array of model names.
 * @param {string} model - Current model name.
 */
const addManyToManyRelations = (obj, models, model) => {
	models.forEach(otherModel => {
		if(model !== otherModel) {
			const otherModelPlural = pluralize(otherModel);
			const otherModelPluralCamelCase = otherModelPlural.charAt(0).toLowerCase() + otherModelPlural.slice(1);
			const modelPlural = pluralize(model);
			const modelPluralCamelCase = modelPlural.charAt(0).toLowerCase() + modelPlural.slice(1);

			if(obj[model][otherModelPluralCamelCase] && obj[otherModel][modelPluralCamelCase]) {
				if(typeof obj[model].relations === 'undefined') {
					obj[model].relations = {};
				}

				obj[model].relations[otherModel] = {
					type: 'many-to-many',
					model: otherModel,
					plural: otherModelPlural,
				};
			}
		}
	});
};

/**
 * Adds one-to-many relations to the model object.
 *
 * @param {Object} obj - ORM object with models and fields.
 * @param {string[]} models - Array of model names.
 * @param {string} model - Current model name.
 */
const addOneToManyRelations = (obj, models, model) => {
	models.forEach(otherModel => {
		if(model !== otherModel) {
			Object.keys(obj[model]).forEach(field => {
				const otherModelCamelCase = otherModel.charAt(0).toUpperCase() + otherModel.slice(1);

				if(field !== 'relations' && field === `id${ otherModelCamelCase }`) {
					Object.keys(obj[otherModel]).forEach(otherField => {
						if(otherField !== 'relations' && otherField === pluralize(model)) {
							if(typeof obj[model].relations === 'undefined') {
								obj[model].relations = {};
							}

							obj[model].relations[otherModel] = {
								type: 'one-to-many',
								model: otherModel,
								field: field,
							};
						}
					});
				}
			});
		}
	});
};



let PrismaOrmObject = null;

try {
	PrismaOrmObject = generatePrismaOrmObject();
} catch(e) {
	console.log(chalk.white.bgRed('⚠️💎 Prisma does not exist. Please initialize it first if you want to use it.'));
}

export { PrismaOrmObject };