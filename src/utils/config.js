// config/index.js
import 'dotenv/config';

/**
 * Validates that required environment variables are present
 * @param {string[]} required - Array of required env var names
 * @throws {Error} If any required env vars are missing
 */
function validateRequiredEnvVars(required) {
	const missing = required.filter(key => !process.env[key]);
	if(missing.length > 0) {
		throw new Error(`Missing required environment variables: ${ missing.join(', ') }`);
	}
}

/**
 * Converts string to integer with validation
 * @param {string} value - The string value to convert
 * @param {number} defaultValue - Default value if conversion fails
 * @param {number|null} min - Minimum allowed value
 * @param {number|null} max - Maximum allowed value
 * @returns {number} Parsed integer
 */
function parseIntWithValidation(value, defaultValue, min = null, max = null) {
	if(!value) return defaultValue;

	const parsed = parseInt(value, 10);
	if(isNaN(parsed)) {
		console.warn(`Invalid number value: ${ value }, using default: ${ defaultValue }`);
		return defaultValue;
	}

	if(min !== null && parsed < min) {
		console.warn(`Value ${ parsed } below minimum ${ min }, using minimum`);
		return min;
	}

	if(max !== null && parsed > max) {
		console.warn(`Value ${ parsed } above maximum ${ max }, using maximum`);
		return max;
	}

	return parsed;
}

/**
 * Parses boolean environment variables
 * @param {string} value - The string value to convert
 * @param {boolean} defaultValue - Default value if conversion fails
 * @returns {boolean} Parsed boolean
 */
function parseBoolean(value, defaultValue) {
	if(!value) return defaultValue;
	return [ 'true', '1', 'yes', 'on' ].includes(value.toLowerCase());
}

/**
 * Parses array from comma-separated string
 * @param {string} value - Comma-separated string
 * @param {any[]} defaultValue - Default array value
 * @returns {any[]} Parsed array
 */
function parseArray(value, defaultValue = []) {
	if(!value) return defaultValue;
	return value.split(',').map(item => item.trim()).filter(Boolean);
}

// Validate critical environment variables first
validateRequiredEnvVars([
	'ACCESS_TOKEN_SECRET',
]);

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';
const isProduction = NODE_ENV === 'production';
const isTesting = NODE_ENV === 'test';

const config = {
	// Environment info
	env: {
		NODE_ENV,
		isDevelopment,
		isProduction,
		isTesting,
	},

	// Server configuration
	server: {
		port: parseIntWithValidation(process.env.PORT, 1337, 1000, 65535),
		fallbackPorts: parseArray(process.env.FALLBACK_PORTS, [ '8008', '10101' ]).map(p => parseInt(p, 10)),
		host: process.env.HOST || '0.0.0.0',
		bodyLimit: process.env.BODY_LIMIT || '10mb',
		timeout: parseIntWithValidation(process.env.SERVER_TIMEOUT, 30000, 1000, 300000), // 30s default, max 5min
	},

	// Database configuration
	database: {
		url: process.env.DATABASE_URL,
		connectionLimit: parseIntWithValidation(process.env.DB_CONNECTION_LIMIT, 10, 1, 100),
		queryTimeout: parseIntWithValidation(process.env.DB_QUERY_TIMEOUT, 30000, 1000, 60000),
		retryAttempts: parseIntWithValidation(process.env.DB_RETRY_ATTEMPTS, 3, 1, 10),
		enableLogging: parseBoolean(process.env.DB_ENABLE_LOGGING, isDevelopment),
		ssl: parseBoolean(process.env.DB_SSL, isProduction),
	},

	// JWT configuration
	jwt: {
		secret: process.env.ACCESS_TOKEN_SECRET,
		expiresIn: process.env.JWT_EXPIRES_IN || '24h',
		issuer: process.env.JWT_ISSUER || 'primate-api',
		algorithm: process.env.JWT_ALGORITHM || 'HS256',
	},

	// Authentication configuration
	auth: {
		masterToken: process.env.MASTER_TOKEN,
		logMasterTokenUsage: parseBoolean(process.env.LOG_MASTER_TOKEN_USAGE, isDevelopment),
		masterTokenMinLength: 32, // Minimum length for master token
	},

	// API configuration
	api: {
		// Pagination
		pagination: {
			defaultLimit: parseIntWithValidation(process.env.DEFAULT_PAGE_LIMIT, 100, 1, 1000),
			maxLimit: parseIntWithValidation(process.env.MAX_PAGE_LIMIT, 1000, 1, 10000),
			defaultPage: 1,
			defaultSortBy: process.env.DEFAULT_SORT_BY || 'id',
			defaultSortOrder: process.env.DEFAULT_SORT_ORDER || 'desc',
		},

		// Rate limiting
		rateLimit: {
			windowMs: parseIntWithValidation(process.env.RATE_LIMIT_WINDOW, 15 * 60 * 1000, 60000, 3600000), // 15 min default
			max: parseIntWithValidation(process.env.RATE_LIMIT_MAX, 100, 1, 10000),
			skipSuccessfulRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESS, false),
		},

		// CORS
		cors: {
			origin: parseArray(process.env.CORS_ORIGIN, [ '*' ]),
			methods: parseArray(process.env.CORS_METHODS, [ 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH' ]),
			allowedHeaders: parseArray(process.env.CORS_HEADERS, [
				'Content-Type',
				'Authorization',
				'Content-Encoding',
				'Accept-Encoding',
			]),
			credentials: parseBoolean(process.env.CORS_CREDENTIALS, false),
		},
	},

	// Logging configuration
	logging: {
		level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
		format: process.env.LOG_FORMAT || (isDevelopment ? 'simple' : 'json'),
		enableFile: parseBoolean(process.env.LOG_ENABLE_FILE, isProduction),
		enableConsole: parseBoolean(process.env.LOG_ENABLE_CONSOLE, true),
		maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20MB',
		maxFiles: parseIntWithValidation(process.env.LOG_MAX_FILES, 5, 1, 50),
	},

	// Security configuration
	security: {
		enableHelmet: parseBoolean(process.env.SECURITY_ENABLE_HELMET, true),
		enableRateLimit: parseBoolean(process.env.SECURITY_ENABLE_RATE_LIMIT, isProduction),
		sessionSecret: process.env.SESSION_SECRET,
		bcryptRounds: parseIntWithValidation(process.env.BCRYPT_ROUNDS, 12, 8, 15),
		passwordMinLength: parseIntWithValidation(process.env.PASSWORD_MIN_LENGTH, 8, 6, 50),
	},

	// Primate-specific configuration
	primate: {
		entitiesDir: process.env.ENTITIES_DIR || './entities',
		routesDir: process.env.ROUTES_DIR || './routes',
		suppressEntitiesNotFound: parseBoolean(process.env.SUPPRESS_ENTITIES_NOT_FOUND, false),
		enablePrisma: parseBoolean(process.env.ENABLE_PRISMA, true),
		prismaClientLocation: process.env.PRISMA_CLIENT_LOCATION || '@prisma/client',
		enableSchemaValidation: parseBoolean(process.env.ENABLE_SCHEMA_VALIDATION, isProduction),
		autoGenerateRoutes: parseBoolean(process.env.AUTO_GENERATE_ROUTES, true),
	},

	// Cache configuration
	cache: {
		enabled: parseBoolean(process.env.CACHE_ENABLED, false),
		provider: process.env.CACHE_PROVIDER || 'memory', // memory, redis
		ttl: parseIntWithValidation(process.env.CACHE_TTL, 300, 1, 86400), // 5 minutes default
		redisUrl: process.env.REDIS_URL,
	},

	// File upload configuration
	upload: {
		maxFileSize: process.env.UPLOAD_MAX_FILE_SIZE || '50MB',
		allowedTypes: parseArray(process.env.UPLOAD_ALLOWED_TYPES, [
			'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
		]),
		uploadDir: process.env.UPLOAD_DIR || './uploads',
		enableCloudStorage: parseBoolean(process.env.ENABLE_CLOUD_STORAGE, false),
	},
};

// Validate configuration after parsing
function validateConfig() {
	const errors = [];

	// Check JWT secret length
	if(config.jwt.secret && config.jwt.secret.length < 32) {
		errors.push('JWT secret should be at least 32 characters long');
	}

	// Check database URL in production
	/*if(isProduction && !config.database.url) {
		errors.push('DATABASE_URL is required in production');
	}*/

	// Check master token length if provided
	if(config.auth.masterToken && config.auth.masterToken.length < config.auth.masterTokenMinLength) {
		errors.push(`Master token should be at least ${ config.auth.masterTokenMinLength } characters long`);
	}

	// Warn if master token is used in production without proper security measures
	if(isProduction && config.auth.masterToken && !config.auth.logMasterTokenUsage) {
		console.warn('⚠️  Master token is configured in production but usage logging is disabled. Consider enabling LOG_MASTER_TOKEN_USAGE=true for security monitoring.');
	}

	// Check session secret in production
	if(isProduction && !config.security.sessionSecret) {
		errors.push('SESSION_SECRET is required in production');
	}

	if(errors.length > 0) {
		throw new Error(`Configuration validation failed:\n${ errors.join('\n') }`);
	}
}

validateConfig();

// Freeze the config to prevent accidental modifications
export default Object.freeze(config);

// Export individual sections for convenience
export const { env, server, database, jwt, api, logging, security, primate, cache, upload } = config;