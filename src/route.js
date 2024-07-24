import express from 'express';
import PrimateService from './generics/service.js';
import PrimateController from './generics/controller.js';
import auth from './middlewares/auth.js';

/**
 * Creates a new Express router.
 *
 * @returns {object} A new Express router instance.
 */
const getRouter = () => express.Router();

/**
 * Sets up routes for a given model using a provided or default router.
 *
 * @param {string} model - The name of the model.
 * @param {express.Router} router - The Express router to set up routes on.
 * @param {Object} [options={}] - Optional parameters.
 */
const setupRoute = (model, router, options = {}) => {
	const controller = new PrimateController(model, options);

	// Use custom router if provided, otherwise use the given router
	const routeHandler = options.router || router;
	PrimateService.prepareCrUDAGRoutes(routeHandler, controller, options);
};

export { getRouter, auth, setupRoute };