import morgan, { StreamOptions } from 'morgan';
import Logger from './logger';

const stream: StreamOptions = {
    write: (message) => Logger.http(message),
};

const SkipPaths = ['/api/v1/status'];

// Build the morgan middleware
const morganMiddleware = morgan(':method :url :status - :response-time ms', {
    stream,
    skip: (req) => {
        const env = process.env.NODE_ENV || 'development';
        const shouldSkipPath: boolean =
            !!req.url && SkipPaths.includes(req.url);
        return env === 'development' ? false : shouldSkipPath;
    },
});

export default morganMiddleware;
