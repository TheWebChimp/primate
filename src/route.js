import express from 'express';
import PrimateService from './generics/service.js';
import PrimateController from './generics/controller.js';
import auth from './middlewares/auth.js';

const getRouter = () => express.Router()

const setupRoute = (model, router, options = {}) => {

	const controller = new PrimateController(model, options);
	if(!!options.router) {
		PrimateService.prepareCrUDAGRoutes(options.router, controller);
		return;
	}

	PrimateService.prepareCrUDAGRoutes(router, controller);
};

export { getRouter, auth, setupRoute };