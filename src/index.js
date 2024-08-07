import primate from './primate.js';

export * from './utils.js';
export * from './route.js';
export { default as PrimateController } from './generics/controller.js';
export { default as PrimateService } from './generics/service.js';
export { default as prisma } from './prisma/client.js';
export { PrismaOrmObject } from './prisma/orm.js';
export { default as jwt } from './jwt.js';

export default primate;