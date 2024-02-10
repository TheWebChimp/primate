import bodyParser from 'body-parser';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Defining the Express app
const app = express();

// Adding Helmet to enhance APIs security
app.use(helmet({
	crossOriginEmbedderPolicy: false,
	crossOriginOpenerPolicy: false,
	crossOriginResourcePolicy: false,
}));

app.use((req, res, next) => {
    if (req.url.startsWith('/raw/')) { 
        return next(); 
    }
    bodyParser.json()(req, res, next);
});
// Enabling CORS for all requests
app.use(cors());

// Adding morgan to log HTTP requests
app.use(morgan('combined'));

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

	// if the status is not 2xx, set result to error
	if(status < 200 || status > 299) {
		jsonResponse.result = 'error';
	}

	return this.contentType('application/json')
		.status(status)
		.send(jsonResponse);
};

export default app;