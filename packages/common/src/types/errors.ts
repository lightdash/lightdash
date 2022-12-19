// eslint-disable-next-line max-classes-per-file
import { DbtLog } from './job';

/**
 * The Error object is returned from the api any time there is an error.
 * The message contains
 */
export type ApiErrorPayload = {
    status: 'error';
    error: {
        /**
         * HTTP status code
         * @format integer
         */
        statusCode: number;
        /**
         * Unique name for the type of error
         */
        name: string;
        /**
         * A friendly message summarising the error
         */
        message?: string;
        /**
         * Optional data containing details of the error
         */
        data?: any;
    };
};

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

export class ExpiredError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'ExpiredError',
            statusCode: 406,
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

export class NonCompiledModelError extends LightdashError {
    constructor(message: string, data: { [key: string]: any } = {}) {
        super({
            message,
            name: 'NonCompiledModelError',
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

export class NoServerRunningError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NoServerRunningError',
            statusCode: 500,
            data: {},
        });
    }
}

export class MissingWarehouseCredentialsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'MissingWarehouseCredentialsError',
            statusCode: 400,
            data: {},
        });
    }
}

export class UnexpectedServerError extends LightdashError {
    constructor(
        message = 'Unexpected error in Lightdash server',
        data: { [key: string]: any } = {},
    ) {
        super({
            message,
            name: 'UnexpectedServerError',
            statusCode: 500,
            data,
        });
    }
}

export class UnexpectedGitError extends LightdashError {
    constructor(
        message = 'Unexpected error in Git adapter',
        data: { [key: string]: any } = {},
    ) {
        super({
            message,
            name: 'UnexpectedGitError',
            statusCode: 500,
            data,
        });
    }
}

export class UnexpectedDatabaseError extends LightdashError {
    constructor(
        message = 'Unexpected error in Lightdash database',
        data: { [key: string]: any } = {},
    ) {
        super({
            message,
            name: 'UnexpectedDatabaseError',
            statusCode: 500,
            data,
        });
    }
}

export class ParseError extends LightdashError {
    constructor(
        message = 'Error parsing dbt project and lightdash metadata',
        data: { [key: string]: any } = {},
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
        data: Record<string, any> = {},
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
        data: { [key: string]: any } = {},
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
    logs: DbtLog[] | undefined;

    constructor(message = 'Dbt raised an error', logs: DbtLog[] = []) {
        super({
            message,
            name: 'DbtError',
            statusCode: 500,
            data: {},
        });
        this.logs = logs;
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

export class WarehouseConnectionError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'WarehouseConnectionError',
            statusCode: 500, // TODO: is this a server error? could be credentials
            data: {},
        });
    }
}

export class WarehouseQueryError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'WarehouseQueryError',
            statusCode: 500, // TODO: is this a server error? usually syntax error
            data: {},
        });
    }
}

export class SmptError extends LightdashError {
    constructor(message: string, data: { [key: string]: any } = {}) {
        super({
            message,
            name: 'SmptError',
            statusCode: 500,
            data,
        });
    }
}

export class AlreadyProcessingError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AlreadyProcessingError',
            statusCode: 409,
            data: {},
        });
    }
}
export class AlreadyExistsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AlreadyExistsError',
            statusCode: 409,
            data: {},
        });
    }
}
