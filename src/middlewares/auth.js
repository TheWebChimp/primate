import crypto from 'crypto';
import jwt from '../utils/jwt.js';

/**
 * Performs a timing-safe comparison of two tokens.
 * Prevents timing attacks by ensuring comparison takes constant time.
 *
 * @param {string} a - First token to compare.
 * @param {string} b - Second token to compare.
 * @returns {boolean} True if tokens match, false otherwise.
 */
const safeCompare = (a, b) => {
	if(typeof a !== 'string' || typeof b !== 'string') {
		return false;
	}
	if(a.length !== b.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Authentication middleware to verify JWT tokens.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
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

		// Check if master token is provided and matches environment variable
		const masterToken = process.env.MASTER_TOKEN;

		if(masterToken && safeCompare(token, masterToken)) {
			// Set a special user object for master token
			req.user = {
				payload: {
					id: 0,
					role: 'master',
					permissions: [ '*' ], // All permissions
					isMaster: true,
				},
				type: 'master',
			};

			// Log master token usage (optional, for security monitoring)
			if(process.env.LOG_MASTER_TOKEN_USAGE === 'true') {
				console.info(`Master token used for ${ req.method } ${ req.originalUrl } from IP: ${ req.ip }`);
			}

			return next();
		}

		// If not master token, verify as regular JWT token
		// Verify the JWT token
		req.user = await jwt.verifyAccessToken(token);
		req.user.type = 'jwt';
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
				message: 'Unauthorized: ' + e.message,
			});
		}
	}
};

/**
 * Middleware that only accepts master token (no JWT tokens allowed)
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
const masterOnly = async (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader) {
			return res.respond({
				status: 401,
				message: 'Unauthorized: Master token required.',
			});
		}

		const token = authHeader.split(' ')[1];
		if (!token) {
			return res.respond({
				status: 401,
				message: 'Unauthorized: Master token required.',
			});
		}

		const masterToken = process.env.MASTER_TOKEN;
		if (!masterToken) {
			return res.respond({
				status: 500,
				message: 'Server Error: Master token not configured.',
			});
		}

		if (!safeCompare(token, masterToken)) {
			return res.respond({
				status: 403,
				message: 'Forbidden: Invalid master token.',
			});
		}

		req.user = {
			payload: {
				id: 'master',
				role: 'master',
				permissions: ['*'],
				isMaster: true,
			},
			type: 'master'
		};

		if (process.env.LOG_MASTER_TOKEN_USAGE === 'true') {
			console.info(`Master-only access for ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
		}

		next();
	} catch (e) {
		res.respond({
			status: 401,
			message: 'Unauthorized: ' + e.message,
		});
	}
};

/**
 * Helper function to check if current user is using master token
 *
 * @param {Object} req - Express request object
 * @returns {boolean} True if using master token
 */
const isMasterToken = (req) => {
	return req.user && req.user.type === 'master' && req.user.payload.isMaster === true;
};

/**
 * Helper function to check if user has specific permission
 * Master token has all permissions
 *
 * @param {Object} req - Express request object
 * @param {string} permission - Permission to check
 * @returns {boolean} True if user has permission
 */
const hasPermission = (req, permission) => {
	if (!req.user || !req.user.payload) return false;

	// Master token has all permissions
	if (isMasterToken(req)) return true;

	// Check user permissions
	const permissions = req.user.payload.permissions || [];
	return permissions.includes(permission) || permissions.includes('*');
};

export default auth;
export { masterOnly, isMasterToken, hasPermission };