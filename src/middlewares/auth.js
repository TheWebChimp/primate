import jwt from '../jwt.js';

/**
 * Authentication middleware to verify JWT tokens.
 *
 * @param {Object} req - Express request object.
 * @param {Object} req.headers - Request headers.
 * @param {string} req.headers.authorization - Authorization header containing the JWT token.
 * @param {Object} res - Express response object.
 * @param {Function} res.respond - Custom response function to send the response.
 * @param {Function} next - Express next middleware function.
 * @throws {Error} If any error occurs during token verification.
 */

const auth = async (req, res, next) => {
	try {
		// Validate the Authorization header
		const authHeader = req.headers.authorization;
		if(!authHeader) {
			return res.respond({
				status: 401,
				message: 'Unauthorized: No authorization header present.',
			});
		}

		// Extract the token from the Authorization header
		const token = authHeader.split(' ')[1];
		if(!token) {
			return res.respond({
				status: 401,
				message: 'Unauthorized: Please provide a valid token.',
			});
		}

		// Verify the JWT token
		req.user = await jwt.verifyAccessToken(token);
		next();

	} catch(e) {
		if(e.name === 'TokenExpiredError') {
			res.respond({
				status: 401,
				message: 'Unauthorized: Token has expired: ' + e.message,
			});
		} else if(e.name === 'JsonWebTokenError') {
			res.respond({
				status: 401,
				message: 'Unauthorized: Invalid token: ' + e.message,
			});
		} else {
			res.respond({
				status: 401,
				message: 'Unathorized: ' + e.message,
			});
		}
	}
};

export default auth;