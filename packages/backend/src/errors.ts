import { LightdashError, UnexpectedServerError } from '@lightdash/common';
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
