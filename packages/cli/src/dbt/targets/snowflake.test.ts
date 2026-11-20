import {
    ParseError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { convertSnowflakeSchema } from './snowflake';

const baseTarget = {
    type: 'snowflake',
    account: 'abc123',
    role: 'ANALYST',
    database: 'DB',
    warehouse: 'WH',
    schema: 'jaffle',
};

describe('convertSnowflakeSchema', () => {
    test('should parse password authentication', async () => {
        expect(
            await convertSnowflakeSchema({
                ...baseTarget,
                user: 'someone',
                password: 'secret',
            }),
        ).toMatchObject({
            type: WarehouseTypes.SNOWFLAKE,
            user: 'someone',
            password: 'secret',
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
        });
    });

    test('should parse private key authentication', async () => {
        expect(
            await convertSnowflakeSchema({
                ...baseTarget,
                user: 'someone',
                private_key: 'key',
            }),
        ).toMatchObject({
            privateKey: 'key',
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
        });
    });

    test('should parse externalbrowser authentication', async () => {
        expect(
            await convertSnowflakeSchema({
                ...baseTarget,
                user: 'someone',
                authenticator: 'externalbrowser',
            }),
        ).toMatchObject({
            authenticationType: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        });
    });

    test('should parse oauth access token authentication without a user', async () => {
        expect(
            await convertSnowflakeSchema({
                ...baseTarget,
                authenticator: 'oauth',
                token: 'access-token',
            }),
        ).toEqual({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'abc123',
            user: '',
            authenticationType: SnowflakeAuthenticationType.SSO,
            token: 'access-token',
            role: 'ANALYST',
            database: 'DB',
            warehouse: 'WH',
            schema: 'jaffle',
            clientSessionKeepAlive: undefined,
            queryTag: undefined,
        });
    });

    test('should reject oauth refresh token profiles with the skip flags', async () => {
        const promise = convertSnowflakeSchema({
            ...baseTarget,
            authenticator: 'OAuth',
            token: 'refresh-token',
            oauth_client_id: 'id',
            oauth_client_secret: 'secret',
        });
        await expect(promise).rejects.toThrow(ParseError);
        await expect(promise).rejects.toThrow(/oauth_client_id/);
        await expect(promise).rejects.toThrow(/--skip-warehouse-catalog/);
    });

    test('should reject oauth without a token', async () => {
        await expect(
            convertSnowflakeSchema({ ...baseTarget, authenticator: 'oauth' }),
        ).rejects.toThrow(/needs "token"/);
    });

    test('should reject unsupported authenticators with the skip flags', async () => {
        const promise = convertSnowflakeSchema({
            ...baseTarget,
            user: 'someone',
            authenticator: 'username_password_mfa',
        });
        await expect(promise).rejects.toThrow(/username_password_mfa/);
        await expect(promise).rejects.toThrow(/--skip-warehouse-catalog/);
    });

    test('should require a user outside oauth', async () => {
        await expect(
            convertSnowflakeSchema({ ...baseTarget, password: 'secret' }),
        ).rejects.toThrow(/"user" is required/);
    });
});
