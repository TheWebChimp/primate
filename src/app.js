import bodyParser from 'body-parser'; // Import body-parser for parsing request bodies
import express from 'express'; // Import express for creating the server
import cors from 'cors'; // Import cors for enabling Cross-Origin Resource Sharing
import helmet from 'helmet'; // Import helmet for securing the app by setting various HTTP headers
import morgan from 'morgan'; // Import morgan for logging HTTP requests

/**
 * Creates and configures an Express application.
 *
 * @param {Object} [options={}] - Configuration options for the application.
 * @param {Function} [options.preProcess] - A hook function to run before middleware setup.
 * @param {Function} [options.postProcess] - A hook function to run after middleware setup.
 * @param {string[]} [options.allowedHeaders] - Additional headers to allow in CORS.
 * @returns {Object} - The configured Express application instance.
 */
const createApp = (options = {}) => {

	// Defining the Express app
	const app = express();

	// check if options has preProcess hook
	if(typeof options.preProcess === 'function') {
		options.preProcess(app);
	}

	// Adding Helmet to enhance APIs security
	app.use(helmet({
		crossOriginEmbedderPolicy: false,
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: false,
	}));

	// Middleware to handle JSON parsing with a limit of 10 mb
	app.use((req, res, next) => {
		if(req.originalUrl.startsWith('/raw')) {
			next();
		} else {
			express.json({ limit: '10mb' })(req, res, next);
		}
	});

	// Define default allowed headers and merge with any provided in options
	const defaultAllowedHeaders = [ 'Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding' ];
	const allowedHeaders = Array.isArray(options.allowedHeaders)
		? [ ...defaultAllowedHeaders, ...options.allowedHeaders ]
		: defaultAllowedHeaders;

	app.use((req, res, next) => {
		if(req.method === 'OPTIONS') {
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS,DELETE,PATCH');
			res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
			// If you need to handle pre-flight OPTIONS request, you can respond with status 200
			return res.status(200).end();
		}
		next();
	});

	// Enabling CORS for all requests
	app.use(cors());

	// Adding morgan to log HTTP requests in the 'combined' format
	app.use(morgan('combined'));

	// Extend the response object with a custom respond method for standardized API responses
	app.response.respond = function({
		data = {},
		result = 'success',
		status = 200,
		message = '',
		props = {},
	} = {}) {
		const responsePayload = {
			result: status >= 200 && status < 300 ? result : 'error',
			status,
			data,
			message,
			...props,
		};
		return this.contentType('application/json').status(status).send(responsePayload);
	};

	// check if options has postProcess hook
	if(typeof options.postProcess === 'function') {
		options.postProcess(app);
	}

	return app;
};

export default createApp;