import Primate from './primate.js';

// Instantiate and export a Primate instance
const primate = new Primate();

// Exports -------------------------------------------------------------------------------------------------------------

export { default as Primate } from './primate.js';
export default primate;

export * from './route.js';
export { default as PrimateController } from './generics/controller.js';
export { default as PrimateService } from './generics/service.js';
export { default as jwt } from './jwt.js';