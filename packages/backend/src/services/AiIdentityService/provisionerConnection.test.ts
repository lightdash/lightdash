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

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('ProvisionerConnection', () => {
    it('reads the SQL procedure log and the exposure check', async () => {
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
                    HAS_OK_RUN: 1,
                },
            ],
            fields: {},
        });
        query.mockResolvedValueOnce({
            rows: [{ AI_ROLE: 'ANALYST_AI', DATABASE_NAME: 'DATA' }],
            fields: {},
        });
        query.mockResolvedValueOnce({
            rows: [{ AI_EXPOSURE_CHECK: { status: 'OK', exposed: [] } }],
            fields: {},
        });
        const run = await connection.readAutomaticSync();
        expect(run.status).toBe(AiIdentitySyncStatus.OK);
        expect(run.progress).toBe(12);
        expect(run.hasOkRun).toBe(true);
        expect(run.exposure).toEqual({
            status: 'OK',
            exposed: [],
            error: null,
        });
        expect(run.managedScope).toEqual([
            { roleName: 'ANALYST_AI', database: 'DATA' },
        ]);
        expect(String(query.mock.calls[3][0])).toContain(
            'CALL LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_EXPOSURE_CHECK()',
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
                rows: [],
                fields: {},
            })
            .mockResolvedValueOnce({
                rows: [{ AI_ROLE: 'ANALYST_AI', DATABASE_NAME: 'DATA' }],
                fields: {},
            })
            .mockResolvedValueOnce({
                rows: [{ AI_EXPOSURE_CHECK: { status: 'OK', exposed: [] } }],
                fields: {},
            });
        const run = await connection.readAutomaticSync();
        expect(run.status).toBe(AiIdentitySyncStatus.RUNNING);
        expect(run.hasOkRun).toBe(false);
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

describe('readAiExposure', () => {
    let sequence = 0;
    const makeConnection = () => {
        sequence += 1;
        return new ProvisionerConnection(
            credentials,
            'PROVISIONER',
            `EXPOSURE_${sequence}`,
            'PRIVATE',
            { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
        );
    };
    it.each([
        { status: 'OK', exposed: [], format: 'object' },
        { status: 'OK', exposed: [], format: 'JSON' },
        { status: 'UNSAFE', exposed: ['SCHEMA DATA.SECRET'], format: 'object' },
        { status: 'UNSAFE', exposed: ['SCHEMA DATA.SECRET'], format: 'JSON' },
    ])('parses $format results for $status', async ({ format, ...result }) => {
        const raw = format === 'JSON' ? JSON.stringify(result) : result;
        vi.spyOn(
            SnowflakeWarehouseClient.prototype,
            'runQuery',
        ).mockResolvedValue({ rows: [{ AI_EXPOSURE_CHECK: raw }], fields: {} });
        await expect(makeConnection().readAiExposure()).resolves.toEqual({
            ...result,
            error: null,
        });
    });
    it.each(['OK', 'UNSAFE'] as const)(
        'caches %s results for exactly 60 seconds',
        async (status) => {
            vi.useFakeTimers();
            const connection = makeConnection();
            const query = vi
                .spyOn(SnowflakeWarehouseClient.prototype, 'runQuery')
                .mockResolvedValue({
                    rows: [{ AI_EXPOSURE_CHECK: { status, exposed: [] } }],
                    fields: {},
                });
            await connection.readAiExposure();
            await vi.advanceTimersByTimeAsync(59_999);
            await connection.readAiExposure();
            expect(query).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            await connection.readAiExposure();
            expect(query).toHaveBeenCalledTimes(2);
        },
    );
    it.each(['rejected call', 'SQL error', 'invalid JSON', 'invalid shape'])(
        'caches %s failures for only 10 seconds and recovers',
        async (kind) => {
            vi.useFakeTimers();
            const connection = makeConnection();
            const query = vi.spyOn(
                SnowflakeWarehouseClient.prototype,
                'runQuery',
            );
            if (kind === 'rejected call')
                query.mockRejectedValueOnce(
                    new Error('Cannot inspect DATA.SECRET'),
                );
            else {
                const responses = {
                    'SQL error': {
                        status: 'UNSAFE',
                        error: 'Cannot inspect DATA.SECRET',
                    },
                    'invalid JSON': '{',
                    'invalid shape': { status: 'UNKNOWN' },
                };
                query.mockResolvedValueOnce({
                    rows: [
                        {
                            AI_EXPOSURE_CHECK:
                                responses[kind as keyof typeof responses],
                        },
                    ],
                    fields: {},
                });
            }
            query.mockResolvedValue({
                rows: [{ AI_EXPOSURE_CHECK: { status: 'OK' } }],
                fields: {},
            });
            const failure = await connection.readAiExposure();
            expect(failure).toEqual({
                status: 'UNSAFE',
                exposed: [],
                error: expect.any(String),
            });
            await vi.advanceTimersByTimeAsync(9_999);
            expect(await connection.readAiExposure()).toEqual(failure);
            expect(query).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            await expect(connection.readAiExposure()).resolves.toEqual({
                status: 'OK',
                exposed: [],
                error: null,
            });
            expect(query).toHaveBeenCalledTimes(2);
        },
    );
});

it.each([undefined, 120])(
    'preserves the normal provisioner timeout %s',
    async (timeoutSeconds) => {
        const timeouts: Array<number | undefined> = [];
        vi.spyOn(
            SnowflakeWarehouseClient.prototype,
            'runQuery',
        ).mockImplementation(
            async function capture(this: SnowflakeWarehouseClient) {
                timeouts.push(this.credentials.timeoutSeconds);
                return { rows: [], fields: {} };
            },
        );
        const connection = new ProvisionerConnection(
            { ...credentials, timeoutSeconds },
            'PROVISIONER',
            'ROLE',
            'PRIVATE',
            { mappedRoles: new Set(), lightdashCreatedUsers: new Set() },
        );
        await connection.users();
        await connection.grantsToRole('ROLE');
        expect(timeouts).toEqual([timeoutSeconds, timeoutSeconds]);
    },
);
