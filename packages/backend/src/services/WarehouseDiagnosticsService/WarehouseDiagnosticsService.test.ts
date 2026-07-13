import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { SnowflakeDiagnosticError } from '@lightdash/warehouses';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    generateSnowflakeGrantScript,
    WarehouseDiagnosticsService,
} from './WarehouseDiagnosticsService';

const organizationUuid = defaultSessionUser.organizationUuid!;

const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'acme.eu-west-1',
    user: 'lightdash_user',
    password: 'secret',
    role: 'lightdash_role',
    database: 'analytics',
    warehouse: 'lightdash_wh',
    schema: 'public',
};

const postgresCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.example.com',
    user: 'lightdash_user',
    password: 'secret',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const getAccount = (canCreateProject = true) =>
    fromSession(
        {
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>(
                canCreateProject
                    ? [
                          {
                              subject: 'Project',
                              action: 'create',
                              conditions: { organizationUuid },
                          },
                      ]
                    : [],
            ),
        },
        'session-cookie',
    );

const session = { connection: {} } as never;

const getSnowflakeClient = () => ({
    resolveDiagnosticHost: vi.fn(async () => undefined),
    openDiagnosticConnection: vi.fn(async () => session),
    authenticateDiagnosticConnection: vi.fn(async () => ({
        role: 'LIGHTDASH_ROLE',
        user: 'LIGHTDASH_USER',
        database: 'ANALYTICS',
        warehouse: 'LIGHTDASH_WH',
    })),
    listDiagnosticTables: vi.fn(async () => ({
        schemaCount: 1,
        tableCount: 2,
    })),
    selectOneDiagnosticConnection: vi.fn(async () => undefined),
    closeDiagnosticConnection: vi.fn(async () => undefined),
});

describe('WarehouseDiagnosticsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs Snowflake checks in order and skips later checks after a failure', async () => {
        const client = getSnowflakeClient();
        client.listDiagnosticTables.mockRejectedValueOnce(
            new SnowflakeDiagnosticError({
                code: '002003',
                message:
                    "Database 'ANALYTICS' does not exist or not authorized",
            }),
        );
        const service = new WarehouseDiagnosticsService({
            snowflakeClientFactory: () => client,
        });

        const result = await service.testConnection(getAccount(), credentials);

        expect(result.status).toBe('failed');
        expect(result.checks.map(({ id, status }) => ({ id, status }))).toEqual(
            [
                { id: 'resolve_host', status: 'passed' },
                { id: 'open_connection', status: 'passed' },
                { id: 'authenticate', status: 'passed' },
                { id: 'list_schemas', status: 'failed' },
                { id: 'select_1', status: 'skipped' },
            ],
        );
        expect(
            result.checks
                .slice(0, 4)
                .every((check) => typeof check.durationMs === 'number'),
        ).toBe(true);
        expect(result.checks[3].diagnosis).toMatchObject({
            title: 'Role cannot access the database',
            remedySql: expect.stringContaining(
                'GRANT USAGE ON DATABASE "ANALYTICS" TO ROLE "LIGHTDASH_ROLE";',
            ),
        });
        expect(client.selectOneDiagnosticConnection).not.toHaveBeenCalled();
        expect(client.closeDiagnosticConnection).toHaveBeenCalledWith(session);
    });

    it('maps warehouse authorization failures to a warehouse grant', async () => {
        const client = getSnowflakeClient();
        client.selectOneDiagnosticConnection.mockRejectedValueOnce(
            new SnowflakeDiagnosticError({
                code: '002043',
                message:
                    "Warehouse 'LIGHTDASH_WH' does not exist or not authorized",
            }),
        );
        const service = new WarehouseDiagnosticsService({
            snowflakeClientFactory: () => client,
        });

        const result = await service.testConnection(getAccount(), credentials);

        expect(result.checks[4].diagnosis).toEqual({
            title: 'Role cannot use the warehouse',
            detail: expect.stringContaining('LIGHTDASH_ROLE'),
            remedySql:
                'GRANT USAGE ON WAREHOUSE "LIGHTDASH_WH" TO ROLE "LIGHTDASH_ROLE";',
            docsUrl: expect.stringContaining('docs.lightdash.com'),
        });
    });

    it('treats an empty visible table list as missing database access', async () => {
        const client = getSnowflakeClient();
        client.listDiagnosticTables.mockResolvedValueOnce({
            schemaCount: 0,
            tableCount: 0,
        });
        const service = new WarehouseDiagnosticsService({
            snowflakeClientFactory: () => client,
        });

        const result = await service.testConnection(getAccount(), credentials);

        expect(result.checks[3]).toMatchObject({
            status: 'failed',
            diagnosis: {
                title: 'Role cannot access the database',
                remedySql: expect.stringContaining(
                    'GRANT SELECT ON FUTURE TABLES IN DATABASE "ANALYTICS"',
                ),
            },
        });
    });

    it('rejects callers without project creation permission before creating a client', async () => {
        const snowflakeClientFactory = vi.fn(() => getSnowflakeClient());
        const service = new WarehouseDiagnosticsService({
            snowflakeClientFactory,
        });

        await expect(
            service.testConnection(getAccount(false), credentials),
        ).rejects.toThrow(ForbiddenError);
        expect(snowflakeClientFactory).not.toHaveBeenCalled();
    });

    it('uses the generic client test for non-Snowflake credentials', async () => {
        const test = vi.fn(async () => undefined);
        const warehouseClientFactory = vi.fn(() => ({ test }));
        const service = new WarehouseDiagnosticsService({
            warehouseClientFactory,
        });

        const result = await service.testConnection(
            getAccount(),
            postgresCredentials,
        );

        expect(warehouseClientFactory).toHaveBeenCalledWith(
            postgresCredentials,
        );
        expect(test).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
            status: 'passed',
            checks: [{ id: 'open_connection', status: 'passed' }],
        });
        expect(result.checks[0].durationMs).toEqual(expect.any(Number));
    });

    it('sanitizes failures from the generic client path', async () => {
        const service = new WarehouseDiagnosticsService({
            warehouseClientFactory: () => ({
                test: vi.fn(async () => {
                    throw new Error('socket 10.0.0.1:5432 refused');
                }),
            }),
        });

        const result = await service.testConnection(
            getAccount(),
            postgresCredentials,
        );

        expect(JSON.stringify(result)).not.toContain('10.0.0.1');
        expect(result.checks[0].diagnosis?.title).toBe('Connection failed');
    });
});

describe('generateSnowflakeGrantScript', () => {
    it('generates a least-privilege database-wide script', () => {
        const sql = generateSnowflakeGrantScript({
            roleName: 'lightdash_role',
            databaseName: 'analytics',
            warehouseName: 'lightdash_wh',
            userName: 'lightdash_user',
        });

        expect(sql).toContain('CREATE ROLE IF NOT EXISTS "LIGHTDASH_ROLE";');
        expect(sql).toContain(
            'GRANT USAGE ON ALL SCHEMAS IN DATABASE "ANALYTICS" TO ROLE "LIGHTDASH_ROLE";',
        );
        expect(sql).toContain(
            'GRANT SELECT ON FUTURE TABLES IN DATABASE "ANALYTICS" TO ROLE "LIGHTDASH_ROLE";',
        );
        expect(sql).toContain(
            'GRANT ROLE "LIGHTDASH_ROLE" TO USER "LIGHTDASH_USER";',
        );
    });

    it('rejects identifiers containing SQL tokens', () => {
        expect(() =>
            generateSnowflakeGrantScript({
                roleName: 'FOO; DROP TABLE',
                databaseName: 'analytics',
                warehouseName: 'lightdash_wh',
            }),
        ).toThrow(ParameterError);
    });

    it('generates schema-scoped grants instead of database-wide grants', () => {
        const sql = generateSnowflakeGrantScript({
            roleName: 'lightdash_role',
            databaseName: 'analytics',
            warehouseName: 'lightdash_wh',
            schemas: ['finance', 'operations'],
        });

        expect(sql).toContain(
            'GRANT USAGE ON SCHEMA "ANALYTICS"."FINANCE" TO ROLE "LIGHTDASH_ROLE";',
        );
        expect(sql).toContain(
            'GRANT SELECT ON FUTURE TABLES IN SCHEMA "ANALYTICS"."OPERATIONS" TO ROLE "LIGHTDASH_ROLE";',
        );
        expect(sql).not.toContain('ALL SCHEMAS IN DATABASE');
    });
});
