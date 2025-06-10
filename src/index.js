import Primate from './lib/primate.js';

// Instantiate and export a Primate instance
const primate = new Primate();

// Exports -------------------------------------------------------------------------------------------------------------

export { Primate };
export { default as auth } from './middlewares/auth.js';
export { default as PrimateController } from './lib/controller.js';
export { default as PrimateService } from './lib/service.js';
export { default as jwt } from './utils/jwt.js';

export default primate;