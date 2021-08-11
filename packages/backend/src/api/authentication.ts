import { RequestHandler } from 'express-serve-static-core';
import { LightdashMode } from 'common';
import { AuthorizationError } from '../errors';
import { lightdashConfig } from '../config/lightdashConfig';

export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.user?.userUuid) {
        next();
    } else {
        next(new AuthorizationError(`Failed to authorize user`));
    }
};
export const unauthorisedInDemo: RequestHandler = (req, res, next) => {
    if (lightdashConfig.mode === LightdashMode.DEMO) {
        throw new AuthorizationError('Action not available in demo');
    } else {
        next();
    }
};
