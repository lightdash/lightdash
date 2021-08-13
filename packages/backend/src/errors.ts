import { Response } from 'express';
import { HttpError } from 'express-openapi-validator/dist/framework/types';

type LightdashErrorParams = {
    message: string;
    name: string;
    statusCode: number;
    data: { [key: string]: any };
};

export class LightdashError extends Error {
    statusCode: number;

    data: { [key: string]: any };

    constructor({ message, name, statusCode, data }: LightdashErrorParams) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.data = data;
    }
}

export class ForbiddenError extends LightdashError {
    constructor(
        message = 'Forbidden error',
        data: { [key: string]: any } = {},
    ) {
        super({
            message,
            name: 'ForbiddenError',
            statusCode: 403,
            data,
        });
    }
}

export class AuthorizationError extends LightdashError {
    constructor(
        message = 'Authorization error',
        data: { [key: string]: any } = {},
    ) {
        super({
            message,
            name: 'AuthorizationError',
            statusCode: 401,
            data,
        });
    }
}

export class NotExistsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotExistsError',
            statusCode: 404,
            data: {},
        });
    }
}

export class ParameterError extends LightdashError {
    constructor(
        message: string = 'Incorrect parameters',
        data: Record<string, any> = {},
    ) {
        super({
            message,
            name: 'ParameterError',
            statusCode: 400,
            data,
        });
    }
}

export class MissingCatalogEntryError extends LightdashError {
    constructor(message: string, data: { [key: string]: any }) {
        super({
            message,
            name: 'MissingCatalogEntryError',
            statusCode: 400,
            data,
        });
    }
}

export class UnexpectedServerError extends LightdashError {
    constructor(message = 'Unexpected error in Lightdash server') {
        super({
            message,
            name: 'UnexpectedServerError',
            statusCode: 500,
            data: {},
        });
    }
}

export class ParseError extends LightdashError {
    constructor(
        message = 'Error parsing dbt project and lightdash metadata',
        data: { [key: string]: any },
    ) {
        super({
            message,
            name: 'ParseError',
            statusCode: 500,
            data,
        });
    }
}

export class CompileError extends LightdashError {
    constructor(
        message = 'Error compiling sql from Lightdash configuration',
        data: Record<string, any>,
    ) {
        super({
            message,
            name: 'CompileError',
            statusCode: 500,
            data,
        });
    }
}

export class NetworkError extends LightdashError {
    constructor(
        message = 'Error connecting to external service',
        data: { [key: string]: any },
    ) {
        super({
            message,
            name: 'NetworkError',
            statusCode: 500,
            data,
        });
    }
}

export class DbtError extends LightdashError {
    constructor(message = 'Dbt raised an error', data: { [key: string]: any }) {
        super({
            message,
            name: 'DbtError',
            statusCode: 500,
            data,
        });
    }
}

export class RetryableNetworkError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'RetryableNetworkError',
            statusCode: 503,
            data: {},
        });
    }
}

export class NotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });
    }
}

export const errorHandler = async (error: Error, res: Response) => {
    if (error instanceof LightdashError) {
        res.status(error.statusCode).send({
            status: 'error',
            error: {
                statusCode: error.statusCode,
                name: error.name,
                message: error.message,
                data: error.data,
            },
        });
    } else if (error instanceof HttpError) {
        res.status(error.status).send({
            status: 'error',
            error: {
                statusCode: error.status,
                name: error.name,
                message: error.message,
                data: error.errors,
            },
        });
    } else {
        console.error(error);
        res.status(500).send({
            status: 'error',
            error: {
                statusCode: 500,
                name: 'UnexpectedServerError',
                message: `${error}`,
                data: {},
            },
        });
    }
};
