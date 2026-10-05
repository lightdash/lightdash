import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { SnowflakeWarehouseClient } from '@lightdash/warehouses';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProvisionerConnection } from './provisionerConnection';

const credentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'project',
    password: 'password',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    authenticationType: SnowflakeAuthenticationType.PASSWORD,
} satisfies CreateSnowflakeCredentials;

const operation = {
    kind: 'create_user' as const,
    userName: 'ALICE_AI',
    publicKey: 'YWJj',
    defaultRole: 'ANALYST_AI',
    comment: 'AI user',
};

afterEach(() => vi.restoreAllMocks());

describe('ProvisionerConnection', () => {
    it('marks a user as created only after Snowflake accepts the statement', async () => {
        const created = new Set<string>();
        const connection = new ProvisionerConnection(
            credentials,
            'PROVISIONER',
            'PROVISIONER_ROLE',
            'PRIVATE',
            {
                mappedRoles: new Set(['ANALYST_AI']),
                lightdashCreatedUsers: created,
            },
        );
        vi.spyOn(SnowflakeWarehouseClient.prototype, 'runQuery')
            .mockRejectedValueOnce(new Error('failed'))
            .mockResolvedValueOnce({ rows: [], fields: {} });
        await expect(connection.execute(operation)).rejects.toThrow('failed');
        expect(created.has('ALICE_AI')).toBe(false);
        await connection.execute(operation);
        expect(created.has('ALICE_AI')).toBe(true);
    });
});
