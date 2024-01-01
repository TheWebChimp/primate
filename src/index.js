import primate from './primate.js';

export { importRoutes, setupRoutes } from './utils.js';
export { getRouter, auth, setupRoute } from './route.js';
export { default as PrimateController } from './generics/controller.js';
export { default as PrimateService } from './generics/service.js';

export default primate;