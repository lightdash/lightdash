import { NextFunction, Request, Response } from 'express';

import {
    LightdashError,
    ScimError,
    UnexpectedServerError,
} from '@lightdash/common';
import { ValidateError } from '@tsoa/runtime';

export const errorHandler = (error: Error): LightdashError => {
    if (error instanceof ValidateError) {
        return new LightdashError({
            statusCode: 422,
            name: error.name,
            message: error.message,
            data: error.fields,
        });
    }
    if (error instanceof LightdashError) {
        return error;
    }
    // Return a generic error to avoid exposing internal details
    return new UnexpectedServerError();
};

export const scimErrorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    if (error instanceof ScimError) {
        const statusInt = parseInt(error.status, 10);
        // Return a response that aligns with the SCIM spec
        res.status(statusInt).json(error.toJSON());
    } else {
        next(error); // Pass the error to the next middleware if it's not a ScimError
    }
};
