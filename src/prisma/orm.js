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
}
export const PrismaOrmObject = obj;