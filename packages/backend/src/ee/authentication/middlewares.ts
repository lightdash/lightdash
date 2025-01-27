import { getErrorMessage, ScimError } from '@lightdash/common';
import { RequestHandler } from 'express';
import { ScimService } from '../services/ScimService/ScimService';

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
            throw new Error('Invalid SCIM token');
        }
        // extract the token from the array
        const token = tokenParts[1];
        // Check if the token is valid
        if (!token) {
            throw new Error('No SCIM token provided');
        }
        // Attach SCIM serviceAccount to request
        const serviceAccount = await req.services
            .getScimService<ScimService>()
            .authenticateToken(token, {
                method: req.method,
                path: req.path,
                routePath: req.route.path,
            });

        if (serviceAccount) {
            req.serviceAccount = serviceAccount;
            next();
        } else {
            throw new Error('Invalid SCIM token');
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
