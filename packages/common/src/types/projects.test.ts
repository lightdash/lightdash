import type {
    CreateDatabricksCredentials,
    CreateSnowflakeCredentials,
} from './projects';
import {
    SnowflakeAuthenticationType,
    stripUserSpecificFields,
    WarehouseTypes,
} from './projects';

describe('stripUserSpecificFields', () => {
    it('should remove all user-specific fields from Snowflake credentials', () => {
        const credentials: CreateSnowflakeCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'test-account',
            database: 'test-db',
            warehouse: 'test-warehouse',
            schema: 'public',
            user: 'org-user',
            refreshToken: 'org-refresh-token',
            token: 'org-access-token',
            password: 'org-password',
            authenticationType: SnowflakeAuthenticationType.SSO,
        };

        const stripped = stripUserSpecificFields(credentials);

        // Should keep connection config
        expect(stripped).toEqual({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'test-account',
            database: 'test-db',
            warehouse: 'test-warehouse',
            schema: 'public',
            authenticationType: SnowflakeAuthenticationType.SSO,
        });

        // Should remove all user-specific fields
        expect(stripped).not.toHaveProperty('user');
        expect(stripped).not.toHaveProperty('refreshToken');
        expect(stripped).not.toHaveProperty('token');
        expect(stripped).not.toHaveProperty('password');
    });

    it('should remove user-specific fields from Databricks credentials', () => {
        const credentials: CreateDatabricksCredentials = {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'test-host',
            httpPath: '/sql/test',
            database: 'test-db',
            personalAccessToken: 'org-pat',
            refreshToken: 'org-refresh-token',
            oauthClientId: 'org-client-id',
            oauthClientSecret: 'org-client-secret',
        };

        const stripped = stripUserSpecificFields(credentials);

        expect(stripped).not.toHaveProperty('personalAccessToken');
        expect(stripped).not.toHaveProperty('refreshToken');
        expect(stripped).not.toHaveProperty('oauthClientId');
        expect(stripped).not.toHaveProperty('oauthClientSecret');

        // Should keep connection config
        expect(stripped).toHaveProperty('type', WarehouseTypes.DATABRICKS);
        expect(stripped).toHaveProperty('serverHostName', 'test-host');
        expect(stripped).toHaveProperty('httpPath', '/sql/test');
        expect(stripped).toHaveProperty('database', 'test-db');
    });
});
