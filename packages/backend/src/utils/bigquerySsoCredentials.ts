import {
    BIGQUERY_UNSUPPORTED_KEYFILE_MESSAGE,
    ParameterError,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import type { LightdashConfig } from '../config/parseConfig';

export const assertValidPersistedBigquerySsoKeyfile = (
    keyfile: unknown,
): void => {
    if (
        typeof keyfile !== 'object' ||
        keyfile === null ||
        Array.isArray(keyfile) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(keyfile))
    ) {
        throw new ParameterError('BigQuery key file must be a JSON object');
    }
    const fields = keyfile as Record<string, unknown>;
    if (fields.type !== 'authorized_user') {
        throw new ParameterError(BIGQUERY_UNSUPPORTED_KEYFILE_MESSAGE);
    }
    for (const field of ['client_id', 'refresh_token']) {
        if (typeof fields[field] !== 'string' || !fields[field].trim()) {
            throw new ParameterError(`BigQuery key file is missing "${field}"`);
        }
    }
    const nonStringField = Object.entries(fields).find(
        ([, value]) =>
            value !== undefined && value !== null && typeof value !== 'string',
    );
    if (nonStringField) {
        throw new ParameterError(
            `BigQuery key file field "${nonStringField[0]}" must be a string`,
        );
    }
};

export const hydrateBigquerySsoKeyfile = (
    keyfile: CreateBigqueryCredentials['keyfileContents'],
    google: Pick<
        LightdashConfig['auth']['google'],
        'oauth2ClientId' | 'oauth2ClientSecret'
    >,
): CreateBigqueryCredentials['keyfileContents'] => {
    const configuredSecret = google.oauth2ClientSecret?.trim()
        ? google.oauth2ClientSecret
        : undefined;
    return {
        ...keyfile,
        client_secret: (keyfile?.client_id === google.oauth2ClientId
            ? (configuredSecret ?? keyfile?.client_secret)
            : (keyfile?.client_secret ?? configuredSecret))!,
    };
};
