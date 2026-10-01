import {
    WarehouseAccessCheckKind,
    WarehouseConnectionFailureCause,
    WarehouseConnectionTestStage,
    WarehouseConnectionTestStageStatus,
    WarehouseQueryError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    redactConnectionDetails,
    runStagedConnectionTest,
    type ConnectionProbes,
} from './runStagedConnectionTest';

const postgres: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'db.example.com',
    user: 'analyst',
    password: 'super-secret',
    port: 5432,
    dbname: 'analytics',
    schema: 'marts',
};

const snowflake: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'org-acct',
    user: 'analyst',
    password: 'super-secret',
    role: 'REPORTER',
    database: 'ANALYTICS',
    warehouse: 'WH',
    schema: 'MARTS',
};

const passingProbes = (): ConnectionProbes => ({
    tcp: vi.fn(async () => undefined),
    tls: vi.fn(async () => undefined),
});

const fakeClient = (rows: Record<string, unknown>[], testError?: Error) => ({
    test: vi.fn(async () => {
        if (testError) throw testError;
    }),
    runQuery: vi.fn(async () => ({ fields: {}, rows })),
    escapeString: (value: string) => value.replaceAll("'", "''"),
});

const statuses = (
    stages: { stage: WarehouseConnectionTestStage; status: string }[],
) => Object.fromEntries(stages.map(({ stage, status }) => [stage, status]));

describe('runStagedConnectionTest', () => {
    it('passes every observable stage and marks Postgres TLS as not checked separately', async () => {
        const probes = passingProbes();
        const result = await runStagedConnectionTest({
            credentials: postgres,
            connectThroughTunnel: false,
            createClient: async () =>
                fakeClient([
                    { schema_exists: true, has_usage: true, table_count: '12' },
                ]),
            secrets: ['super-secret'],
            probes,
        });

        expect(result.ok).toBe(true);
        expect(statuses(result.stages)).toEqual({
            reach_host: WarehouseConnectionTestStageStatus.PASSED,
            tls: WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY,
            sign_in: WarehouseConnectionTestStageStatus.PASSED,
            check_access: WarehouseConnectionTestStageStatus.PASSED,
        });
        expect(probes.tcp).toHaveBeenCalledWith(
            { host: 'db.example.com', port: 5432 },
            10_000,
        );
        expect(probes.tls).not.toHaveBeenCalled();
        expect(result.access).toEqual({
            kind: WarehouseAccessCheckKind.HAS_TABLES,
            schema: 'marts',
            tableCount: 12,
        });
    });

    it('stops at reach host and does not run later stages', async () => {
        const createClient = vi.fn();
        const result = await runStagedConnectionTest({
            credentials: postgres,
            connectThroughTunnel: false,
            createClient,
            secrets: [],
            probes: {
                tcp: async () => {
                    throw Object.assign(new Error('connect ECONNREFUSED'), {
                        code: 'ECONNREFUSED',
                    });
                },
                tls: vi.fn(),
            },
        });

        expect(result.ok).toBe(false);
        expect(result.failure).toMatchObject({
            stage: WarehouseConnectionTestStage.REACH_HOST,
            cause: WarehouseConnectionFailureCause.NETWORK,
            driverCode: 'ECONNREFUSED',
        });
        expect(statuses(result.stages)).toEqual({
            reach_host: WarehouseConnectionTestStageStatus.FAILED,
            tls: WarehouseConnectionTestStageStatus.NOT_RUN,
            sign_in: WarehouseConnectionTestStageStatus.NOT_RUN,
            check_access: WarehouseConnectionTestStageStatus.NOT_RUN,
        });
        expect(createClient).not.toHaveBeenCalled();
    });

    it('does not probe the host through an SSH tunnel', async () => {
        const probes = passingProbes();
        const result = await runStagedConnectionTest({
            credentials: { ...postgres, useSshTunnel: true },
            connectThroughTunnel: true,
            createClient: async () =>
                fakeClient([
                    { schema_exists: true, has_usage: true, table_count: 3 },
                ]),
            secrets: [],
            probes,
        });

        expect(probes.tcp).not.toHaveBeenCalled();
        expect(result.stages[0].status).toBe(
            WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY,
        );
    });

    it('checks TLS separately for Snowflake and names a TLS failure', async () => {
        const result = await runStagedConnectionTest({
            credentials: snowflake,
            connectThroughTunnel: false,
            createClient: vi.fn(),
            secrets: [],
            probes: {
                tcp: async () => undefined,
                tls: async () => {
                    throw Object.assign(new Error('self-signed certificate'), {
                        code: 'SELF_SIGNED_CERT_IN_CHAIN',
                    });
                },
            },
        });

        expect(result.host).toBe('org-acct.snowflakecomputing.com');
        expect(result.failure).toMatchObject({
            stage: WarehouseConnectionTestStage.TLS,
            cause: WarehouseConnectionFailureCause.TLS,
        });
    });

    it('classifies a sign-in failure and redacts the secret in the details', async () => {
        const result = await runStagedConnectionTest({
            credentials: postgres,
            connectThroughTunnel: false,
            createClient: async () =>
                fakeClient(
                    [],
                    new WarehouseQueryError(
                        'password authentication failed: super-secret',
                        { driverCode: '28P01' },
                    ),
                ),
            secrets: ['super-secret'],
            probes: passingProbes(),
        });

        expect(result.failure).toEqual({
            stage: WarehouseConnectionTestStage.SIGN_IN,
            cause: WarehouseConnectionFailureCause.CREDENTIALS,
            driverCode: '28P01',
            details: 'password authentication failed: [redacted]',
        });
        expect(result.grantSuggestion).toBeNull();
    });

    it('offers no GRANT for a schema that does not exist', async () => {
        const result = await runStagedConnectionTest({
            credentials: postgres,
            connectThroughTunnel: false,
            createClient: async () =>
                fakeClient([
                    { schema_exists: false, has_usage: false, table_count: 0 },
                ]),
            secrets: [],
            probes: passingProbes(),
        });

        expect(result.access?.kind).toBe(
            WarehouseAccessCheckKind.DOES_NOT_EXIST,
        );
        expect(result.grantSuggestion).toBeNull();
    });

    it.each([
        [
            { schema_exists: true, has_usage: false, table_count: 0 },
            WarehouseAccessCheckKind.NO_USAGE,
        ],
        [
            { schema_exists: true, has_usage: true, table_count: 0 },
            WarehouseAccessCheckKind.EMPTY,
        ],
    ])(
        'suggests a GRANT for a Postgres schema that is %o',
        async (row, kind) => {
            const result = await runStagedConnectionTest({
                credentials: postgres,
                connectThroughTunnel: false,
                createClient: async () => fakeClient([row]),
                secrets: [],
                probes: passingProbes(),
            });

            expect(result.access?.kind).toBe(kind);
            expect(result.failure?.stage).toBe(
                WarehouseConnectionTestStage.CHECK_ACCESS,
            );
            expect(result.grantSuggestion).toEqual({
                label: 'Likely fix',
                explanation: expect.any(String),
                statements: [
                    'GRANT USAGE ON SCHEMA "marts" TO "analyst";',
                    'GRANT SELECT ON ALL TABLES IN SCHEMA "marts" TO "analyst";',
                ],
            });
        },
    );

    it('reports Snowflake access it cannot tell apart as empty or not visible', async () => {
        const result = await runStagedConnectionTest({
            credentials: snowflake,
            connectThroughTunnel: false,
            createClient: async () => fakeClient([{ table_count: 0 }]),
            secrets: [],
            probes: passingProbes(),
        });

        expect(result.access?.kind).toBe(
            WarehouseAccessCheckKind.EMPTY_OR_NOT_VISIBLE,
        );
        expect(result.grantSuggestion?.statements).toContain(
            'GRANT USAGE ON SCHEMA "ANALYTICS"."MARTS" TO ROLE "REPORTER";',
        );
    });

    it('does not check BigQuery reach or TLS separately', async () => {
        const result = await runStagedConnectionTest({
            credentials: {
                type: WarehouseTypes.BIGQUERY,
                project: 'proj',
                dataset: 'marts',
                location: 'US',
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                maximumBytesBilled: 1_000_000_000,
                keyfileContents: {},
            } as CreateWarehouseCredentials,
            connectThroughTunnel: false,
            createClient: async () => fakeClient([{ table_count: 4 }]),
            secrets: [],
            probes: passingProbes(),
        });

        expect(result.ok).toBe(true);
        expect(result.host).toBeNull();
        expect(result.stages.slice(0, 2).map(({ status }) => status)).toEqual([
            WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY,
            WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY,
        ]);
    });
});

describe('redactConnectionDetails', () => {
    it('removes credentials embedded in a URL', () => {
        expect(
            redactConnectionDetails(
                'could not connect to postgres://admin:hunter22@db:5432/x',
                [],
            ),
        ).toBe('could not connect to postgres://[redacted]@db:5432/x');
    });

    it('ignores very short secrets so it does not mangle the message', () => {
        expect(redactConnectionDetails('a timeout', ['a'])).toBe('a timeout');
    });
});
