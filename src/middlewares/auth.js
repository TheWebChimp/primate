import jwt from '../jwt.js';
import createError from 'http-errors';

const auth = async (req, res, next) => {
	if(!req.headers.authorization) {

		return res.respond({
			status: 401,
			message: 'Unauthorized: No header present.',
		});
	}
	const token = req.headers.authorization.split(' ')[1];
	if(!token) {

		return res.respond({
			status: 401,
			message: 'Unauthorized: Please provide a valid token.',
		});
	}
	await jwt.verifyAccessToken(token).then(user => {
		req.user = user;
		next();
	}).catch(e => {

		res.respond({
			status: 401,
			message: 'Unauthorized: Invalid token: ' + e.message,
		});

		//next(createError.Unauthorized(e.message));
	});
};

export default auth;