import { type AnyType } from './any';

export enum RequestMethod {
    CLI = 'CLI',
    CLI_CI = 'CLI_CI',
    WEB_APP = 'WEB_APP',
    HEADLESS_BROWSER = 'HEADLESS_BROWSER',
    UNKNOWN = 'UNKNOWN',
    BACKEND = 'BACKEND',
}

export const isRequestMethod = (
    value: string | undefined,
): value is RequestMethod =>
    !!value && Object.values(RequestMethod).includes(value as AnyType);
