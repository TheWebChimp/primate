// logger.js
import pino from 'pino';

const transport = pino.transport({
	target: 'pino-pretty',
	options: { colorize: true, translateTime: 'SYS:standard' },
});

const logger = pino(
	{
		level: process.env.LOG_LEVEL || 'info',
		redact: { paths: [ 'req.headers.authorization' ], censor: '***' },
	},
	transport,
);

export default logger;
