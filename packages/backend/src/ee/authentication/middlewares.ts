import {
    AuthorizationError,
    getErrorMessage,
    hasRequiredScopes,
    ScimError,
    ServiceAccountScope,
} from '@lightdash/common';
import { RequestHandler } from 'express';
import { isAuthenticated } from '../../controllers/authentication';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';

// Middleware to extract SCIM user details
export const isScimAuthenticated: RequestHandler = async (req, res, next) => {
    // Check for SCIM headers or payload (assuming SCIM details are in the headers for this example)
    const scimToken = req.headers.authorization;
    try {
        // throw if no SCIM token is found
        if (
            !scimToken ||
            typeof scimToken !== 'string' ||
            scimToken.length === 0
        ) {
            throw new Error('No SCIM token provided');
        }
        // split the token into an array
        const tokenParts = scimToken.split(' ');
        if (tokenParts.length !== 2) {
            throw new Error(
                'Invalid SCIM token. Token should be in the format "Bearer <token>"',
            );
        }
        // extract the token from the array
        const token = tokenParts[1];
        // Check if the token is valid
        if (!token) {
            throw new Error('No SCIM token provided');
        }
        // Attach SCIM serviceAccount to request
        const serviceAccount = await req.services
            .getServiceAccountService<ServiceAccountService>()
            .authenticate(token, {
                method: req.method,
                path: req.path,
                routePath: req.route.path,
            });
        if (serviceAccount) {
            req.serviceAccount = serviceAccount;
            next();
        } else {
            throw new Error('Invalid SCIM token. Authentication failed.');
        }
    } catch (error) {
        next(
            new ScimError({
                detail: getErrorMessage(error),
                status: 401,
            }),
        );
    }
};

// Middleware to extract service account and check scopes
// At the moment, we can only use this middleware on methods that are not user dependant, like running queries
export const authenticateServiceAccount =
    (scopes: ServiceAccountScope[]): RequestHandler =>
    async (req, res, next) => {
        if (req.isAuthenticated()) {
            next();
            return;
        }

        // Check for service account headers or payload (assuming service account details are in the headers for this example)
        const token = req.headers.authorization;
        try {
            // throw if no service account token is found
            if (!token || typeof token !== 'string' || token.length === 0) {
                throw new Error('No service account token provided');
            }
            // split the token into an array
            const tokenParts = token.split(' ');

            // If it is not a specific Bearer token, we do next, without throwing an error
            // This could be an ApiKey token, or already authenticated user
            if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
                // We will execute the next middleware
                next();
                return;
            }

            // extract the token from the array
            const ServiceAccountToken = tokenParts[1];
            // Check if the token is valid
            if (!ServiceAccountToken) {
                throw new AuthorizationError(
                    'No service account token provided',
                );
            }
            // Attach service account serviceAccount to request
            const serviceAccount = await req.services
                .getServiceAccountService<ServiceAccountService>()
                .authenticate(ServiceAccountToken, {
                    method: req.method,
                    path: req.path,
                    routePath: req.route.path,
                });

            if (!serviceAccount) {
                throw new AuthorizationError(
                    'Invalid service account token. Authentication failed.',
                );
            }

            if (!hasRequiredScopes(serviceAccount.scopes, scopes)) {
                throw new AuthorizationError(
                    'Invalid service account token. Missing required scopes.',
                );
            }
            req.serviceAccount = serviceAccount;

            // Also add the admin user to the request
            // This is for backwards compatibility with all the existing service and controller methods
            // that rely on the user object
            if (!serviceAccount.createdByUserUuid) {
                throw new AuthorizationError(
                    'Invalid service account token. Missing created by user uuid.',
                );
            }
            const user = await req.services
                .getUserService()
                .getSessionByUserUuid(serviceAccount.createdByUserUuid);
            req.user = user;

            next();
        } catch (error) {
            next(new AuthorizationError(getErrorMessage(error)));
        }
    };
