import { LightdashError, UnexpectedServerError } from '@lightdash/common';
import { HttpError } from 'express-openapi-validator/dist/framework/types';

export const errorHandler = (error: Error): LightdashError => {
    if (error instanceof LightdashError) {
        return error;
    }
    if (error instanceof HttpError) {
        return new LightdashError({
            statusCode: error.status,
            name: error.name,
            message: error.message,
            data: error.errors,
        });
    }
    return new UnexpectedServerError(`${error}`);
};
