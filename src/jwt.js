import jwt from 'jsonwebtoken';
import createError from 'http-errors';
import 'dotenv/config';

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;

export default {
	/**
	 * Signs an access token using the given payload.
	 *
	 * @param {object} payload - The payload to be included in the token.
	 * @returns {Promise<string>} - A promise that resolves to the signed JWT access token.
	 * @throws {Error} - Throws an error if the payload is invalid or if there is a token signing error.
	 */
	signAccessToken(payload) {
		return new Promise((resolve, reject) => {
			// Validate payload parameter
			if(!payload || typeof payload !== 'object') {
				console.error('Invalid payload:', payload);
				return reject(createError.BadRequest('Payload must be a valid object.'));
			}

			// Sign the JWT access token
			jwt.sign({ payload }, accessTokenSecret, {}, (err, token) => {
				if(err) {
					console.error(err);
					return reject(createError.InternalServerError('Error signing access token.'));
				}
				resolve(token);
			});
		});
	},
	/**
	 * Verifies an access token and returns the payload.
	 *
	 * @param {string} token - The JWT access token to be verified.
	 * @returns {Promise<object>} - A promise that resolves to the decoded payload.
	 * @throws {Error} - Throws an error if the token is invalid or if there is a token verification error.
	 */
	verifyAccessToken(token) {
		return new Promise((resolve, reject) => {
			// Validate token parameter
			if(!token || typeof token !== 'string') {
				return reject(createError.BadRequest('Token must be a valid string.'));
			}

			// Verify the JWT access token
			jwt.verify(token, accessTokenSecret, (err, payload) => {
				if(err) {
					console.log('Error verifying access token:', err);
					const message = err.message;
					return reject(createError.Unauthorized(message));
				}
				resolve(payload);
			});
		});
	},
	/**
	 * Signs a recovery token using the given payload and expiration time.
	 *
	 * @param {object} payload - The payload to be included in the token.
	 * @param {number} seconds - The expiration time in seconds.
	 * @returns {Promise<string>} - A promise that resolves to the signed JWT recovery token.
	 * @throws {Error} - Throws an error if parameters are invalid or if there is a token signing error.
	 */
	signRecoverToken(payload, seconds) {
		return new Promise((resolve, reject) => {
			// Validate payload parameter
			if(!payload || typeof payload !== 'object') {
				return reject(createError.BadRequest('Payload must be a valid object.'));
			}

			// Validate seconds parameter
			if(!seconds || typeof seconds !== 'number') {
				return reject(createError.BadRequest('Expiration time must be a valid number.'));
			}

			// Sign the JWT recovery token
			jwt.sign({ payload }, accessTokenSecret, { expiresIn: seconds }, (err, token) => {
				if(err) {
					console.error('Error signing recovery token:', err);
					return reject(createError.InternalServerError('Error signing recovery token.'));
				}
				resolve(token);
			});
		});
	},
	/**
	 * Verifies a recovery token and returns the payload.
	 *
	 * @param {string} token - The JWT recovery token to be verified.
	 * @returns {Promise<object>} - A promise that resolves to the decoded payload.
	 * @throws {Error} - Throws an error if the token is invalid or if there is a token verification error.
	 */
	verifyRecoverToken(token) {
		return new Promise((resolve, reject) => {
			// Validate token parameter
			if(!token || typeof token !== 'string') {
				return reject(createError.BadRequest('Token must be a valid string.'));
			}

			// Verify the JWT recovery token
			jwt.verify(token, accessTokenSecret, (err, payload) => {
				if(err) {
					const message = err.name === 'JsonWebTokenError' ? 'Unauthorized' : err.message;
					return reject(createError.Unauthorized(message));
				}
				resolve(payload);
			});
		});
	},
};