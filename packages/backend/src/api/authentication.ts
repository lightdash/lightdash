import { LightdashMode } from 'common';
import { RequestHandler } from 'express-serve-static-core';
import { lightdashConfig } from '../config/lightdashConfig';
import { AuthorizationError } from '../errors';

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
