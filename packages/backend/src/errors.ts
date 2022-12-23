import { LightdashError, UnexpectedServerError } from '@lightdash/common';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { ValidateError } from 'tsoa';

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
