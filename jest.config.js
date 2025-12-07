/**
 * Jest configuration for Primate framework
 * Uses ESM modules and provides coverage reporting
 */
export default {
	// Use ESM module support
	testEnvironment: 'node',
	transform: {},

	// Test file patterns
	testMatch: [
		'**/__tests__/**/*.test.js',
		'**/__tests__/**/*.spec.js',
	],

	// Coverage configuration
	collectCoverageFrom: [
		'src/**/*.js',
		'!src/**/*.test.js',
		'!src/index.js',
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50,
		},
	},

	// Module resolution
	moduleFileExtensions: ['js', 'json', 'node'],

	// Ignore patterns
	testPathIgnorePatterns: [
		'/node_modules/',
		'/.playground/',
	],

	// Setup files
	setupFilesAfterEnv: [],

	// Verbose output
	verbose: true,

	// Force exit after tests complete
	forceExit: true,

	// Detect open handles
	detectOpenHandles: true,
};
