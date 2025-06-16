// eslint-disable-next-line max-classes-per-file
import { type AnyType } from './any';
import { type DbtLog } from './job';

type LightdashErrorData = {
    /**
     * Optional URL linking to relevant documentation.
     * Can be used to provide users with additional context/guidance about the error.
     */
    documentationUrl?: string;
    [key: string]: AnyType;
};

type LightdashErrorParams = {
    message: string;
    name: string;
    statusCode: number;
    data: LightdashErrorData;
};

export class LightdashError extends Error {
    statusCode: number;

    data: LightdashErrorData;

    constructor({ message, name, statusCode, data }: LightdashErrorParams) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.data = data;
    }
}

export class ForbiddenError extends LightdashError {
    constructor(
        message = "You don't have access to this resource or action",
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ForbiddenError',
            statusCode: 403,
            data,
        });
    }
}

export class DeactivatedAccountError extends LightdashError {
    constructor(
        message = 'Your account has been deactivated. Please contact your organization administrator.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'DeactivatedAccountError',
            statusCode: 403,
            data,
        });
    }
}

export class AuthorizationError extends LightdashError {
    constructor(
        message = "You don't have authorization to perform this action",
        data: { [key: string]: AnyType } = {},
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
        data: Record<string, AnyType> = {},
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
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'NonCompiledModelError',
            statusCode: 400,
            data,
        });
    }
}

export class MissingCatalogEntryError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType }) {
        super({
            message,
            name: 'MissingCatalogEntryError',
            statusCode: 400,
            data,
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
        message = 'Something went wrong.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedServerError',
            statusCode: 500,
            data,
        });
    }
}
export class UnexpectedIndexError extends LightdashError {
    constructor(
        message = 'Invalid index in array.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedIndexError',
            statusCode: 500,
            data,
        });
    }
}
export class UnexpectedGitError extends LightdashError {
    constructor(
        message = 'Unexpected error in Git adapter',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedGitError',
            statusCode: 400,
            data,
        });
    }
}

export class UnexpectedDatabaseError extends LightdashError {
    constructor(
        message = 'Unexpected error in Lightdash database.',
        data: { [key: string]: AnyType } = {},
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
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ParseError',
            statusCode: 400,
            data,
        });
    }
}

export class CompileError extends LightdashError {
    constructor(
        message = 'Error compiling sql from Lightdash configuration',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'CompileError',
            statusCode: 400,
            data,
        });
    }
}

export class FieldReferenceError extends LightdashError {
    constructor(
        message = 'Failed to reference field in dbt project',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'FieldReferenceError',
            statusCode: 400,
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
            statusCode: 400,
            data: {},
        });
        this.logs = logs;
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

export class InvalidUser extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'InvalidUser',
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
            statusCode: 400,
            data: {},
        });
    }
}

export class WarehouseQueryError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'WarehouseQueryError',
            statusCode: 400,
            data,
        });
    }
}

export class SmptError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
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

export class MissingConfigError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'MissingConfigError',
            statusCode: 422,
            data: {},
        });
    }
}

export class NotEnoughResults extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotEnoughResults',
            statusCode: 406,
            data: {},
        });
    }
}

export class PaginationError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'PaginationError',
            statusCode: 422,
            data: {},
        });
    }
}

export class SlackInstallationNotFoundError extends LightdashError {
    constructor(message: string = 'Could not find slack installation') {
        super({
            message,
            name: 'SlackInstallationNotFoundError',
            statusCode: 404,
            data: {},
        });
    }
}

export class SlackError extends LightdashError {
    constructor(
        message: string = 'Slack API error occurred',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'SlackError',
            statusCode: 400,
            data,
        });
    }
}

export class MsTeamsError extends LightdashError {
    constructor(
        message: string = 'Microsoft Teams API error occurred',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'MsTeamsError',
            statusCode: 400,
            data,
        });
    }
}

export class UnexpectedGoogleSheetsError extends LightdashError {
    constructor(
        message = 'Unexpected error in Google sheets client',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedGoogleSheetsError',
            statusCode: 400,
            data,
        });
    }
}

export class GoogleSheetsTransientError extends LightdashError {
    constructor(
        message = 'Unexpected error in Google Sheets API',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'GoogleSheetsTransientError',
            statusCode: 500,
            data,
        });
    }
}
export class NotImplementedError extends LightdashError {
    constructor(message = 'Not implemented') {
        super({
            message,
            name: 'NotImplemented',
            statusCode: 501,
            data: {},
        });
    }
}
export const getErrorMessage = (e: unknown) =>
    e instanceof Error ? e.message : `Unknown ${typeof e} error`;

export class ScreenshotError extends LightdashError {
    constructor(
        message = 'Error capturing screenshot',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ScreenshotError',
            statusCode: 500,
            data,
        });
    }
}

export class SshTunnelError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'SshTunnelError',
            statusCode: 400,
            data: {},
        });
    }
}

export class ReadFileError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'ReadFileError',
            statusCode: 404,
            data,
        });
    }
}

export class S3Error extends LightdashError {
    constructor(
        message = 'Error occurred while interacting with S3',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'S3Error',
            statusCode: 500,
            data,
        });
    }
}

export class TimeoutError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'TimeoutError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiDuplicateSlackPromptError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiDuplicateSlackPromptError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiSlackMappingNotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiSlackMappingNotFoundError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiAgentNotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiAgentNotFoundError',
            statusCode: 400,
            data: {},
        });
    }
}

export class CustomSqlQueryForbiddenError extends LightdashError {
    constructor(
        message: string = 'User cannot run queries with custom SQL dimensions',
    ) {
        super({
            message,
            name: 'CustomSqlQueryForbiddenError',
            statusCode: 403,
            data: {
                documentationUrl: `https://docs.lightdash.com/references/custom-fields#custom-sql`,
            },
        });
    }
}
