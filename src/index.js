import Primate from './primate.js';
import auth from './middlewares/auth.js';

// Instantiate and export a Primate instance
const primate = new Primate();

// Exports -------------------------------------------------------------------------------------------------------------

export { Primate };
export { auth };
export { default as PrimateController } from './generics/controller.js';
export { default as PrimateService } from './generics/service.js';
export { default as jwt } from './jwt.js';

export default primate;