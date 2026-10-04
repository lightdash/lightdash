import { ParameterError } from '../types/errors';
import {
    assertValidBigqueryKeyfile,
    getBigqueryKeyfileCredentials,
    getBigqueryKeyfileError,
} from './bigqueryKeyfile';

const serviceAccountKeyfile = {
    type: 'service_account',
    project_id: 'project',
    private_key_id: 'key-id',
    private_key: 'private-key',
    client_email: 'robot@project.iam.gserviceaccount.com',
    client_id: '123',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509',
    universe_domain: 'googleapis.com',
};

const authorizedUserKeyfile = {
    type: 'authorized_user',
    client_id: 'client-id',
    client_secret: 'client-secret',
    refresh_token: 'refresh-token',
};

describe('getBigqueryKeyfileError', () => {
    test('accepts a service account key', () => {
        expect(getBigqueryKeyfileError(serviceAccountKeyfile)).toBeUndefined();
    });

    test('accepts user credentials', () => {
        expect(getBigqueryKeyfileError(authorizedUserKeyfile)).toBeUndefined();
    });

    test('accepts a service account key without a type', () => {
        expect(
            getBigqueryKeyfileError({
                client_email: 'robot@project.iam.gserviceaccount.com',
                private_key: 'private-key',
                project_id: 'project',
            }),
        ).toBeUndefined();
    });

    test.each([
        'external_account',
        'external_account_authorized_user',
        'impersonated_service_account',
        'gdch_service_account',
        'unknown',
    ])('rejects unsupported key file types (%s)', (type) => {
        expect(
            getBigqueryKeyfileError({ ...serviceAccountKeyfile, type }),
        ).toMatch(/must be a service account key/);
    });

    test('rejects a type that does not match the required type', () => {
        expect(
            getBigqueryKeyfileError(serviceAccountKeyfile, {
                requireType: 'authorized_user',
            }),
        ).toMatch(/must be a service account key/);
    });

    test.each(['private_key', 'client_email'])(
        'rejects a service account key without %s',
        (field) => {
            const keyfile: Record<string, string> = {
                ...serviceAccountKeyfile,
            };
            delete keyfile[field];
            expect(getBigqueryKeyfileError(keyfile)).toBe(
                `BigQuery key file is missing "${field}"`,
            );
        },
    );

    test.each(['client_id', 'client_secret', 'refresh_token'])(
        'rejects user credentials without %s',
        (field) => {
            expect(
                getBigqueryKeyfileError({
                    ...authorizedUserKeyfile,
                    [field]: '',
                }),
            ).toBe(`BigQuery key file is missing "${field}"`);
        },
    );

    test('rejects non-string values', () => {
        expect(
            getBigqueryKeyfileError({
                ...serviceAccountKeyfile,
                private_key: 123,
            }),
        ).toBe('BigQuery key file field "private_key" must be a string');
    });

    test('rejects nested objects', () => {
        expect(
            getBigqueryKeyfileError({
                ...serviceAccountKeyfile,
                credential_source: { url: 'https://example.com' },
            }),
        ).toBe('BigQuery key file field "credential_source" must be a string');
    });

    test.each([null, undefined, 'key', [], 1])(
        'rejects a key file that is not an object (%s)',
        (keyfile) => {
            expect(getBigqueryKeyfileError(keyfile)).toBe(
                'BigQuery key file must be a JSON object',
            );
        },
    );
});

describe('assertValidBigqueryKeyfile', () => {
    test('throws a ParameterError for unsupported key files', () => {
        expect(() =>
            assertValidBigqueryKeyfile({ type: 'external_account' }),
        ).toThrow(ParameterError);
    });
});

describe('getBigqueryKeyfileCredentials', () => {
    test('only passes known service account fields', () => {
        expect(getBigqueryKeyfileCredentials(serviceAccountKeyfile)).toEqual({
            type: 'service_account',
            project_id: 'project',
            private_key_id: 'key-id',
            private_key: 'private-key',
            client_email: 'robot@project.iam.gserviceaccount.com',
            client_id: '123',
            universe_domain: 'googleapis.com',
        });
    });

    test('only passes known user credential fields', () => {
        expect(
            getBigqueryKeyfileCredentials({
                ...authorizedUserKeyfile,
                quota_project_id: 'quota-project',
                universe_domain: 'example.com',
                token_url: 'https://example.com/token',
            }),
        ).toEqual({
            ...authorizedUserKeyfile,
            quota_project_id: 'quota-project',
        });
    });

    test('drops non-string and nested values', () => {
        expect(
            getBigqueryKeyfileCredentials({
                type: 'service_account',
                private_key: 'private-key',
                client_email: 'robot@project.iam.gserviceaccount.com',
                project_id: { nested: 'value' },
                credential_source: { url: 'https://example.com' },
            }),
        ).toEqual({
            type: 'service_account',
            private_key: 'private-key',
            client_email: 'robot@project.iam.gserviceaccount.com',
        });
    });

    test('keeps a service account key without a type', () => {
        expect(
            getBigqueryKeyfileCredentials({
                client_email: 'robot@project.iam.gserviceaccount.com',
                private_key: 'private-key',
            }),
        ).toEqual({
            client_email: 'robot@project.iam.gserviceaccount.com',
            private_key: 'private-key',
        });
    });

    test('returns an empty object for an empty key file', () => {
        expect(getBigqueryKeyfileCredentials({})).toEqual({});
        expect(getBigqueryKeyfileCredentials(undefined)).toEqual({});
    });

    test('rejects unsupported key file types', () => {
        expect(() =>
            getBigqueryKeyfileCredentials({
                type: 'external_account',
                credential_source: { url: 'https://example.com' },
            }),
        ).toThrow(ParameterError);
    });
});
