import {
    getErrorMessage,
    LightdashError,
    ScimError,
    SlackError,
    UnexpectedServerError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ErrorCode } from '@slack/web-api';
import { ValidateError } from '@tsoa/runtime';
import { NextFunction, Request, Response } from 'express';
import Logger from './logging/logger';

const messageFromValidateError = (error: ValidateError) => {
    // error message might come empty even though it's not supposed to 😠
    if (error.message && error.message.length > 0) return error.message;
    let errorMessage = `Validation failed`;
    const fieldErrors = error.fields;
    if (fieldErrors && typeof fieldErrors === 'object') {
        errorMessage = Object.entries(fieldErrors)
            .map(([name, e]) => `${name}: ${e.message}`)
            .join(', ');
    }
    return errorMessage;
};

export const errorHandler = (error: Error): LightdashError => {
    if (error instanceof ValidateError) {
        const errorMessage = messageFromValidateError(error);
        return new LightdashError({
            statusCode: 422,
            name: error.name,
            message: errorMessage,
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
export const slackErrorHandler = (e: unknown, context: string) => {
    Logger.error(`${context}: ${getErrorMessage(e)}`);

    if (
        typeof e === 'object' &&
        e &&
        'code' in e &&
        e.code === ErrorCode.PlatformError
    ) {
        Sentry.captureException(new SlackError(getErrorMessage(e)));
    } else {
        // Something unexpected happened
        Sentry.captureException(e);
    }
};
