import {
    WarehouseAccessCheckKind,
    WarehouseConnectionFailureCause,
    WarehouseConnectionTestStage,
    WarehouseConnectionTestStageStatus,
    type WarehouseAccessCheck,
} from '@lightdash/common';

export const STAGE_LABELS: Record<WarehouseConnectionTestStage, string> = {
    [WarehouseConnectionTestStage.REACH_HOST]: 'Reach the host',
    [WarehouseConnectionTestStage.TLS]: 'Secure connection (TLS)',
    [WarehouseConnectionTestStage.SIGN_IN]: 'Sign in',
    [WarehouseConnectionTestStage.CHECK_ACCESS]: 'Check access',
};

export const STAGE_STATUS_LABELS: Record<
    WarehouseConnectionTestStageStatus,
    string
> = {
    [WarehouseConnectionTestStageStatus.PASSED]: 'Passed',
    [WarehouseConnectionTestStageStatus.FAILED]: 'Failed',
    [WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY]:
        'Not checked separately',
    [WarehouseConnectionTestStageStatus.NOT_RUN]: 'Not run',
};

type CauseCopy = {
    headline: (host: string | null) => string;
    nextStep: string;
};

export const CAUSE_COPY: Record<WarehouseConnectionFailureCause, CauseCopy> = {
    [WarehouseConnectionFailureCause.CREDENTIALS]: {
        headline: () => 'Lightdash could not sign in',
        nextStep:
            'Check the user name and the password, key or token for this connection.',
    },
    [WarehouseConnectionFailureCause.NETWORK]: {
        headline: (host) =>
            host
                ? `Lightdash could not reach ${host}`
                : 'Lightdash could not reach your warehouse',
        nextStep:
            'Allow Lightdash’s IP addresses through your firewall or network policy, then test again.',
    },
    [WarehouseConnectionFailureCause.TIMEOUT]: {
        headline: (host) =>
            host
                ? `${host} did not answer in time`
                : 'Your warehouse did not answer in time',
        nextStep:
            'This is usually a firewall that drops the connection. Allow Lightdash’s IP addresses, then test again.',
    },
    [WarehouseConnectionFailureCause.TLS]: {
        headline: (host) =>
            host
                ? `The secure connection to ${host} failed`
                : 'The secure connection failed',
        nextStep:
            'Check the TLS settings for this connection. Lightdash never turns TLS off for you.',
    },
    [WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT]: {
        headline: () => 'Lightdash signed in, but cannot read your data',
        nextStep:
            'Ask an admin to give this user read access, or check the names of the database and schema.',
    },
    [WarehouseConnectionFailureCause.INPUT_FORMAT]: {
        headline: () => 'A connection detail is not in the expected format',
        nextStep: 'Check the host, account or project for typing mistakes.',
    },
    [WarehouseConnectionFailureCause.OTHER]: {
        headline: () => 'The connection test failed',
        nextStep:
            'Read the details below. If it keeps failing, ask a teammate who has access.',
    },
};

const ACCESS_MESSAGES: Record<
    WarehouseAccessCheckKind,
    (schema: string) => string
> = {
    [WarehouseAccessCheckKind.HAS_TABLES]: (schema) =>
        `${schema} has tables Lightdash can read.`,
    [WarehouseAccessCheckKind.EMPTY]: (schema) =>
        `${schema} has no tables this user can read.`,
    [WarehouseAccessCheckKind.NO_USAGE]: (schema) =>
        `This user cannot use the ${schema} schema.`,
    [WarehouseAccessCheckKind.DOES_NOT_EXIST]: (schema) =>
        `${schema} does not exist. Check the schema name.`,
    [WarehouseAccessCheckKind.EMPTY_OR_NOT_VISIBLE]: (schema) =>
        `${schema} is empty, or this user cannot see it.`,
};

export const getAccessMessage = (access: WarehouseAccessCheck): string =>
    ACCESS_MESSAGES[access.kind](access.schema);

const VERIFIED_TLS =
    'Use TLS and check the server certificate. Lightdash does not fall back to an unencrypted connection.';

export const SSL_MODE_DESCRIPTIONS: { value: string; description: string }[] = [
    { value: 'disable', description: 'Connect without TLS.' },
    { value: 'allow', description: VERIFIED_TLS },
    { value: 'prefer', description: VERIFIED_TLS },
    { value: 'require', description: VERIFIED_TLS },
    {
        value: 'no-verify',
        description: 'Use TLS, but accept any server certificate.',
    },
    { value: 'verify-ca', description: VERIFIED_TLS },
    { value: 'verify-full', description: VERIFIED_TLS },
];
