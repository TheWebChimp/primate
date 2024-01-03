import pluralize from 'pluralize';
import { Prisma } from '@prisma/client';
const obj = {};

if(Prisma.dmmf) {

	const prismaModels = Prisma.dmmf.datamodel.models;
	for(const model of prismaModels) {
		const modelName = model.name;

		if(modelName) {
			// first letter to lowercase
			let camelCaseModelName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
			obj[camelCaseModelName] = {};
			for(const field of model.fields) {
				const fieldName = field.name;
				obj[camelCaseModelName][fieldName] = true;
			}
		}
	}

	const models = Object.keys(obj);

	for(const model of models) {

		// many to many
		// check if model has in its fields the plural of the other model and if that model has in its fields the plural of this model
		// if so, add the relation to the model
		for(const otherModel of models) {
			if(model !== otherModel) {
				const otherModelPlural = pluralize(otherModel);
				const otherModelPluralCamelCase = otherModelPlural.charAt(0).toLowerCase() + otherModelPlural.slice(1);
				const modelPlural = pluralize(model);
				const modelPluralCamelCase = modelPlural.charAt(0).toLowerCase() + modelPlural.slice(1);

				if(obj[model][otherModelPluralCamelCase] && obj[otherModel][modelPluralCamelCase]) {

					if(typeof obj[model].relations === 'undefined') {
						obj[model].relations = {};
					}

					// add the relation to the model
					obj[model].relations[otherModel] = {
						type: 'many-to-many',
						model: otherModel,
					};

				}
			}
		}

		// one to many
		// check if model has in its fields something like "idModel"
		// and if that model has in its fields something like "models"
		// if so, add the relation to the model
		for(const otherModel of models) {
			if(model !== otherModel) {
				// iterate fields of model
				for(const field of Object.keys(obj[model])) {

					const otherModelCamelCase = otherModel.charAt(0).toUpperCase() + otherModel.slice(1);

					if(field !== 'relations') {
						// check if field is something like "idModel"
						if(field === `id${ otherModelCamelCase }`) {
							console.log(model, otherModelCamelCase, field);
							// iterate fields of otherModel
							for(const otherField of Object.keys(obj[otherModel])) {
								if(otherField !== 'relations') {
									// check if field is something like "models" in plural
									if(otherField === pluralize(model)) {

										if(typeof obj[model].relations === 'undefined') {
											obj[model].relations = {};
										}

										// add the relation to the model
										obj[model].relations[otherModel] = {
											type: 'one-to-many',
											model: otherModel,
											field: field,
										}

									}
								}
							}
						}
					}
				}
			}
		}
	}
}
export const PrismaOrmObject = obj;