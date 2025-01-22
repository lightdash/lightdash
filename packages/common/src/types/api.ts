export enum RequestMethod {
    CLI = 'CLI',
    CLI_CI = 'CLI_CI',
    WEB_APP = 'WEB_APP',
    HEADLESS_BROWSER = 'HEADLESS_BROWSER',
    UNKNOWN = 'UNKNOWN',
}

export const isRequestMethod = (
    value: string | undefined,
): value is RequestMethod =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!value && Object.values(RequestMethod).includes(value as any);
