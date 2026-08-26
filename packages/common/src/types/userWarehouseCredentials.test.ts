import {
    bigquerySsoUserCredentialsSchema,
    snowflakeUserCredentialsSchema,
} from './userWarehouseCredentials';

describe('snowflakeUserCredentialsSchema', () => {
    it.each([
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'password',
            password: 'password',
        },
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'private_key',
            privateKey: 'private-key',
        },
        {
            type: 'snowflake',
            authenticationType: 'sso',
            refreshToken: 'refresh-token',
        },
    ])('accepts supported credentials: $authenticationType', (credentials) => {
        expect(
            snowflakeUserCredentialsSchema.safeParse(credentials).success,
        ).toBe(true);
    });

    it.each([
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'password',
            password: '',
        },
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'private_key',
            privateKey: '',
        },
        {
            type: 'snowflake',
            authenticationType: 'sso',
            refreshToken: '',
        },
    ])('rejects empty secrets: $authenticationType', (credentials) => {
        expect(
            snowflakeUserCredentialsSchema.safeParse(credentials).success,
        ).toBe(false);
    });
});

describe('bigquerySsoUserCredentialsSchema', () => {
    it('rejects an empty keyfile (the reported bug value)', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            keyfileContents: {},
        });
        expect(result.success).toBe(false);
    });

    it('rejects a keyfile with a blank refresh_token', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client-id',
                client_secret: 'client-secret',
                refresh_token: '',
            },
        });
        expect(result.success).toBe(false);
    });

    it('accepts a keyfile with a valid refresh_token', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            authenticationType: 'sso',
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client-id',
                client_secret: 'client-secret',
                refresh_token: 'a-real-refresh-token',
            },
        });
        expect(result.success).toBe(true);
    });
});
