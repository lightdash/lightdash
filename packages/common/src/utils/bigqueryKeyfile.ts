import { ParameterError } from '../types/errors';

// Only service account and user credentials are supported for key file auth.
export const BIGQUERY_SERVICE_ACCOUNT_KEYFILE_TYPE = 'service_account';
export const BIGQUERY_AUTHORIZED_USER_KEYFILE_TYPE = 'authorized_user';

// dbt-bigquery reads the token endpoint from the key file, so we always
// provide Google's default.
export const BIGQUERY_SERVICE_ACCOUNT_TOKEN_URI =
    'https://oauth2.googleapis.com/token';

export const BIGQUERY_UNSUPPORTED_KEYFILE_MESSAGE =
    'BigQuery key file must be a service account key. Other credential types, such as workload identity federation configurations, are not supported via key file upload.';

const SERVICE_ACCOUNT_FIELDS = [
    'type',
    'project_id',
    'private_key_id',
    'private_key',
    'client_email',
    'client_id',
    'quota_project_id',
    'universe_domain',
] as const;

const SERVICE_ACCOUNT_REQUIRED_FIELDS = ['private_key', 'client_email'];

const AUTHORIZED_USER_FIELDS = [
    'type',
    'client_id',
    'client_secret',
    'refresh_token',
    'quota_project_id',
] as const;

const AUTHORIZED_USER_REQUIRED_FIELDS = [
    'client_id',
    'client_secret',
    'refresh_token',
];

export type BigqueryKeyfileCredentials = Record<string, string>;

type KeyfileKind = 'service_account' | 'authorized_user';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// Key files exported by Google always set `type`. Older CLI uploads of
// service account credentials can omit it, so a missing type means a
// service account key.
const getKeyfileKind = (
    keyfile: Record<string, unknown>,
): KeyfileKind | undefined => {
    switch (keyfile.type) {
        case undefined:
        case BIGQUERY_SERVICE_ACCOUNT_KEYFILE_TYPE:
            return 'service_account';
        case BIGQUERY_AUTHORIZED_USER_KEYFILE_TYPE:
            return 'authorized_user';
        default:
            return undefined;
    }
};

const getFieldsForKind = (kind: KeyfileKind): readonly string[] =>
    kind === 'service_account'
        ? SERVICE_ACCOUNT_FIELDS
        : AUTHORIZED_USER_FIELDS;

const getRequiredFieldsForKind = (kind: KeyfileKind): readonly string[] =>
    kind === 'service_account'
        ? SERVICE_ACCOUNT_REQUIRED_FIELDS
        : AUTHORIZED_USER_REQUIRED_FIELDS;

/**
 * Returns a user-facing error message when the key file is not a supported
 * service account key or user credentials file, otherwise undefined.
 */
export const getBigqueryKeyfileError = (
    keyfile: unknown,
    options: { requireType?: KeyfileKind } = {},
): string | undefined => {
    if (!isPlainObject(keyfile)) {
        return 'BigQuery key file must be a JSON object';
    }
    const kind = getKeyfileKind(keyfile);
    if (
        kind === undefined ||
        (options.requireType !== undefined && kind !== options.requireType)
    ) {
        return BIGQUERY_UNSUPPORTED_KEYFILE_MESSAGE;
    }
    const nonStringField = Object.entries(keyfile).find(
        ([, value]) =>
            value !== undefined && value !== null && typeof value !== 'string',
    );
    if (nonStringField) {
        return `BigQuery key file field "${nonStringField[0]}" must be a string`;
    }
    const missingField = getRequiredFieldsForKind(kind).find(
        (field) => !keyfile[field],
    );
    if (missingField) {
        return `BigQuery key file is missing "${missingField}"`;
    }
    return undefined;
};

export const assertValidBigqueryKeyfile = (
    keyfile: unknown,
    options: { requireType?: KeyfileKind } = {},
): void => {
    const error = getBigqueryKeyfileError(keyfile, options);
    if (error) {
        throw new ParameterError(error);
    }
};

/**
 * Builds the credentials object passed to Google clients. Only known string
 * fields for service account keys and user credentials are copied.
 */
export const getBigqueryKeyfileCredentials = (
    keyfile: unknown,
): BigqueryKeyfileCredentials => {
    if (!isPlainObject(keyfile)) {
        return {};
    }
    const kind = getKeyfileKind(keyfile);
    if (kind === undefined) {
        throw new ParameterError(BIGQUERY_UNSUPPORTED_KEYFILE_MESSAGE);
    }
    return getFieldsForKind(kind).reduce<BigqueryKeyfileCredentials>(
        (acc, field) => {
            const value = keyfile[field];
            if (typeof value === 'string') {
                acc[field] = value;
            }
            return acc;
        },
        {},
    );
};
