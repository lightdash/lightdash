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

it('does not select the setup role during the sign-in probe', async () => {
    const options: Array<SnowflakeWarehouseClient['connectionOptions']> = [];
    vi.spyOn(SnowflakeWarehouseClient.prototype, 'runQuery').mockImplementation(
        async function captureProbe(this: SnowflakeWarehouseClient) {
            options.push(this.connectionOptions);
            return {
                rows: [{ CURRENT_USER: 'PROVISIONER', CURRENT_ROLE: 'PUBLIC' }],
                fields: {},
            };
        },
    );
    const probe = new ProvisionerConnection(
        credentials,
        'PROVISIONER',
        null,
        'PRIVATE',
        { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
    );
    await expect(probe.currentIdentity()).resolves.toEqual({
        user: 'PROVISIONER',
        role: 'PUBLIC',
    });
    expect(options[0].role).toBeUndefined();
    expect(options[0].username).toBe('PROVISIONER');
});
