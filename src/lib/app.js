import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

/**
 * Creates and configures an Express application with security and performance optimizations.
 *
 * @param {Object} [options={}] - Configuration options for the application.
 * @param {Function} [options.preProcess] - A hook function to run before middleware setup.
 * @param {Function} [options.postProcess] - A hook function to run after middleware setup.
 * @param {string[]} [options.allowedHeaders] - Additional headers to allow in CORS.
 * @param {Object} [options.cors] - Custom CORS configuration.
 * @param {Object} [options.helmet] - Custom Helmet configuration.
 * @param {Object} [options.rateLimit] - Custom rate limiting configuration.
 * @param {string} [options.bodyLimit='10mb'] - Request body size limit.
 * @param {boolean} [options.compression=true] - Enable gzip compression.
 * @param {string} [options.logFormat='combined'] - Morgan log format.
 * @returns {Object} - The configured Express application instance.
 */
const createApp = (options = {}) => {

	const app = express();

	// Pre-processing hook
	if(typeof options.preProcess === 'function') options.preProcess(app);

	// Trust proxy (important for rate limiting and getting real IPs behind proxies)
	app.set('trust proxy', 1);

	// Security middleware - Helmet with better defaults
	const helmetConfig = {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: [ '\'self\'' ],
				styleSrc: [ '\'self\'', '\'unsafe-inline\'' ],
				scriptSrc: [ '\'self\'' ],
				imgSrc: [ '\'self\'', 'data:', 'https:' ],
			},
		},
		crossOriginEmbedderPolicy: false,
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: { policy: 'cross-origin' },
		...options.helmet,
	};

	if(options.helmet !== false) app.use(helmet(helmetConfig));

	// Rate limiting
	const rateLimitConfig = {
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 1000, // limit each IP to 1000 requests per windowMs
		message: {
			error: 'Too many requests from this IP, please try again later.',
			status: 429,
		},
		standardHeaders: true,
		legacyHeaders: false,
		...options.rateLimit,
	};

	if(options.rateLimit !== false) app.use(rateLimit(rateLimitConfig));

	// Compression middleware
	if(options.compression !== false) app.use(compression());

	// Body parsing middleware with better error handling
	const bodyLimit = options.bodyLimit || '10mb';

	app.use((req, res, next) => {
		// Skip JSON parsing for specific routes (like file uploads)
		if(req.originalUrl.startsWith('/raw') || req.originalUrl.startsWith('/upload')) {
			return next();
		}

		express.json({
			limit: bodyLimit,
			type: [ 'application/json', 'text/plain' ],
		})(req, res, (err) => {
			if(err) {
				return res.status(400).json({
					error: 'Invalid JSON in request body',
					status: 400,
				});
			}
			next();
		});
	});

	// URL-encoded body parsing
	app.use(express.urlencoded({
		extended: true,
		limit: bodyLimit,
	}));

	// CORS configuration
	const defaultAllowedHeaders = [
		'Content-Type',
		'Authorization',
		'Content-Encoding',
		'Accept-Encoding',
		'X-Requested-With',
		'Accept',
		'Origin',
	];

	const allowedHeaders = Array.isArray(options.allowedHeaders)
		? [ ...defaultAllowedHeaders, ...options.allowedHeaders ]
		: defaultAllowedHeaders;

	const corsConfig = {
		origin: options.cors?.origin || true,
		methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS' ],
		allowedHeaders: allowedHeaders,
		credentials: options.cors?.credentials || false,
		maxAge: 86400, // 24 hours
		...options.cors,
	};

	app.use(cors(corsConfig));

	// Logging middleware
	const logFormat = options.logFormat || 'combined';
	app.use(morgan(logFormat));

	// Request ID middleware for better tracing
	app.use((req, res, next) => {
		req.id = Math.random().toString(36).slice(2, 11);
		res.setHeader('X-Request-ID', req.id);
		next();
	});

	// Enhanced response helper with better error handling and validation
	app.response.respond = function({
		data = null,
		result,
		status = 200,
		message = '',
		meta = {},
		errors = null,
		...additionalProps
	} = {}) {
		// Validate status code
		if(typeof status !== 'number' || status < 100 || status > 599) status = 500;

		// Auto-determine result based on status if not provided
		if(!result) result = status >= 200 && status < 300 ? 'success' : 'error';

		const responsePayload = {
			result,
			status,
			message,
			...(data !== null && { data }),
			...(Object.keys(meta).length > 0 && { meta }),
			...(errors && { errors }),
			...additionalProps,
			timestamp: new Date().toISOString(),
			requestId: this.req?.id,
		};

		// Remove undefined values
		Object.keys(responsePayload).forEach(key => {
			if(responsePayload[key] === undefined) {
				delete responsePayload[key];
			}
		});

		return this
			.status(status)
			.contentType('application/json')
			.json(responsePayload);
	};

	// Health check endpoint
	app.get('/health', (req, res) => {
		res.respond({
			message: 'Service is healthy',
			data: {
				uptime: process.uptime(),
				timestamp: new Date().toISOString(),
				environment: process.env.NODE_ENV || 'development',
			},
		});
	});

	// Post-processing hook
	if(typeof options.postProcess === 'function') options.postProcess(app);

	// Global error handler
	app.use((err, req, res, next) => {
		console.error(`[${ req.id }] Error:`, err);

		// Don't leak error details in production
		const isDevelopment = process.env.NODE_ENV === 'development';

		const statusCode = err.status || err.statusCode || 500;
		const message = err.message || 'Internal Server Error';

		res.respond({
			status: statusCode,
			message: isDevelopment ? message : 'Internal Server Error',
			...(isDevelopment && err.stack && { stack: err.stack }),
			errors: err.errors || null,
		});
	});

	return app;
};
export default createApp;