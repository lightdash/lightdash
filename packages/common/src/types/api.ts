export enum RequestMethod {
    CLI = 'CLI',
    CLI_CI = 'CLI_CI',
    WEB_APP = 'WEB_APP',
    UNKNOWN = 'UNKNOWN',
}

export const isRequestMethod = (
    value: string | undefined,
): value is RequestMethod =>
    !!value && Object.values(RequestMethod).includes(value as any);
