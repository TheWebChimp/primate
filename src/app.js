import bodyParser from 'body-parser'; // Import body-parser for parsing request bodies
import express from 'express'; // Import express for creating the server
import cors from 'cors'; // Import cors for enabling Cross-Origin Resource Sharing
import helmet from 'helmet'; // Import helmet for securing the app by setting various HTTP headers
import morgan from 'morgan'; // Import morgan for logging HTTP requests

// Defining the Express app
const app = express();

// Adding Helmet to enhance APIs security
app.use(helmet({
	crossOriginEmbedderPolicy: false,
	crossOriginOpenerPolicy: false,
	crossOriginResourcePolicy: false,
}));

// Middleware to handle JSON parsing with a limit of 10mb
app.use((req, res, next) => {
	if(req.originalUrl.startsWith('/raw')) {
		next();
	} else {
		express.json({
			limit: '10mb',
		})(req, res, next);
	}
});

//app.use(bodyParser.json({ limit: '10mb' }));
//app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
//app.use(express.json());

// Enabling CORS for all requests
app.use(cors());

// Adding morgan to log HTTP requests in the 'combined' format
app.use(morgan('combined'));

// Custom respond method to standardize API responses
app.response.respond = function({
	data = {},
	result = 'success',
	status = 200,
	message = '',
	props = {},
} = {}) {

	const jsonResponse = {
		result,
		status,
		data,
		message,
	};

	// If props is an object, merge it with jsonResponse
	if(typeof props === 'object') {
		Object.assign(jsonResponse, props);
	}

	// If the status is not 2xx, set result to error
	if(status < 200 || status > 299) {
		jsonResponse.result = 'error';
	}

	return this.contentType('application/json')
		.status(status)
		.send(jsonResponse);
};

export default app;