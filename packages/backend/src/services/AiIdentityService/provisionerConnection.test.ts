import {
    AiIdentitySyncStatus,
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
    it('reads the SQL procedure log and the schema watermark', async () => {
        const connection = new ProvisionerConnection(
            credentials,
            'PROVISIONER',
            'PROVISIONER_ROLE',
            'PRIVATE',
            { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
        );
        const query = vi.spyOn(SnowflakeWarehouseClient.prototype, 'runQuery');
        query.mockResolvedValueOnce({
            rows: [
                {
                    LEVEL: 'INFO',
                    MESSAGE: 'status=OK granted=2 revoked=1',
                    RUN_AT: '2026-10-06T10:00:00.000+00:00',
                },
                {
                    LEVEL: 'INFO',
                    MESSAGE: 'progress=12',
                    RUN_AT: '2026-10-06T09:59:00.000+00:00',
                },
            ],
            fields: {},
        });
        query.mockResolvedValueOnce({
            rows: [
                {
                    FINISHED_AT: '2026-10-06T10:00:00.000+00:00',
                    ELAPSED_MS: 60000,
                },
            ],
            fields: {},
        });
        query.mockResolvedValueOnce({
            rows: [{ AI_ROLE: 'ANALYST_AI', DATABASE_NAME: 'DATA' }],
            fields: {},
        });
        query.mockResolvedValueOnce({
            rows: [{ SCHEMA_WATERMARK: '2026-10-06T09:58:00.000+00:00' }],
            fields: {},
        });
        const run = await connection.readAutomaticSync();
        expect(run.status).toBe(AiIdentitySyncStatus.OK);
        expect(run.progress).toBe(12);
        expect(run.lastOkStartedAt).toEqual(new Date('2026-10-06T09:58:00Z'));
        expect(run.schemaWatermark).toEqual(new Date('2026-10-06T09:58:00Z'));
        expect(run.managedScope).toEqual([
            { roleName: 'ANALYST_AI', database: 'DATA' },
        ]);
        expect(String(query.mock.calls[3][0])).toContain(
            'CALL LIGHTDASH_GOVERNANCE.AI_GRANTS.SCHEMA_WATERMARK()',
        );
    });

    it('shows a first sync as running before the SQL log has a row', async () => {
        const connection = new ProvisionerConnection(
            credentials,
            'PROVISIONER',
            'FIRST_RUN_ROLE',
            'PRIVATE',
            { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
        );
        vi.spyOn(SnowflakeWarehouseClient.prototype, 'runQuery')
            .mockResolvedValueOnce({ rows: [], fields: {} })
            .mockResolvedValueOnce({
                rows: [{ FINISHED_AT: null, ELAPSED_MS: null }],
                fields: {},
            })
            .mockResolvedValueOnce({
                rows: [{ AI_ROLE: 'ANALYST_AI', DATABASE_NAME: 'DATA' }],
                fields: {},
            })
            .mockResolvedValueOnce({
                rows: [{ SCHEMA_WATERMARK: '2026-10-06T09:58:00.000+00:00' }],
                fields: {},
            });
        const run = await connection.readAutomaticSync();
        expect(run.status).toBe(AiIdentitySyncStatus.RUNNING);
        expect(run.lastOkStartedAt).toBeNull();
    });

    it('reads view dependency warnings without changing sync status', async () => {
        const connection = new ProvisionerConnection(
            credentials,
            'PROVISIONER',
            'PROVISIONER_ROLE',
            'PRIVATE',
            { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
        );
        const query = vi
            .spyOn(SnowflakeWarehouseClient.prototype, 'runQuery')
            .mockResolvedValue({
                rows: [
                    {
                        VIEW_DEPENDENCY_WARNINGS: JSON.stringify([
                            {
                                code: 'view_dependency',
                                message:
                                    'Allowed view references an excluded schema.',
                                roleName: 'ANALYST_AI',
                                database: 'DATA',
                                schema: 'PUBLIC',
                            },
                        ]),
                    },
                ],
                fields: {},
            });
        expect(await connection.readViewDependencyWarnings()).toEqual([
            {
                code: 'view_dependency',
                message: 'Allowed view references an excluded schema.',
                roleName: 'ANALYST_AI',
                database: 'DATA',
                schema: 'PUBLIC',
            },
        ]);
        expect(String(query.mock.calls[0][0])).toContain(
            'CALL LIGHTDASH_GOVERNANCE.AI_GRANTS.VIEW_DEPENDENCY_WARNINGS()',
        );
    });

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
