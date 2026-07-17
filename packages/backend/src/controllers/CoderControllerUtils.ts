import type { RequestHandler } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';

export const CODE_READ_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
];

export const CODE_WRITE_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
];

export const codeSuccess = <Results>(
    results: Results,
): { status: 'ok'; results: Results } => ({ status: 'ok', results });
