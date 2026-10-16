import { Ability } from '@casl/ability';
import {
    DuckdbConnectionType,
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type ApiWarehouseConnectionSwitchRequest,
    type CreatePostgresCredentials,
    type CreateTrinoCredentials,
    type PossibleAbilities,
    type ProjectSummary,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type WarehouseConnectionSwitchModel } from '../../models/WarehouseConnectionSwitchModel/WarehouseConnectionSwitchModel';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';
import { credentialRedactionCases } from '../WarehouseConnectionService/credentialRedactionFixtures.mock';
import { warehouseConnectionCredentials } from '../WarehouseConnectionService/warehouseConnectionFixtures.mock';
import { WarehouseConnectionSwitchService } from './WarehouseConnectionSwitchService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const primaryUuid = 'primary-uuid';
const extraUuid = 'extra-uuid';

const account = fromSession(
    {
        ...defaultSessionUser,
        organizationUuid,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'manage' },
        ]),
    },
    'session-cookie',
);

const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'private-host',
    user: 'private-user',
    password: 'private-password',
    port: 5432,
    dbname: 'private_database',
    schema: 'public',
};

const request: ApiWarehouseConnectionSwitchRequest = {
    original: {
        name: 'Primary',
        listAllDatabases: false,
        additionalDatabases: [],
    },
    connection: {
        name: 'Extra',
        warehouseConnection: credentials,
        listAllDatabases: true,
        additionalDatabases: ['private_reporting'],
    },
};

const project = {
    projectUuid,
    projectId: 1,
    organizationUuid,
    type: ProjectType.DEFAULT,
    provisioningSource: null,
    connectionMode: 'single' as const,
    originalWarehouseType: WarehouseTypes.POSTGRES,
    originalOrganizationWarehouseCredentialsUuid: null,
    originalCredentialsFingerprint: 'fingerprint',
};

const summary = {
    projectUuid,
    organizationUuid,
    name: 'Project',
    type: ProjectType.DEFAULT,
    provisioningSource: null,
} as ProjectSummary;

const buildService = (mixedTypesEnabled = false) => {
    const switchModel = {
        getProject: vi.fn().mockResolvedValue(project),
        getContentCounts: vi.fn().mockResolvedValue({
            explores: 2,
            sqlCharts: 1,
            sqlChartVersions: 1,
            dbtSources: 1,
            scheduledDeliveries: 0,
            dashboards: 0,
        }),
        countUsersWithPersonalCredentials: vi.fn().mockResolvedValue(3),
        findEventByIdempotencyKey: vi.fn().mockResolvedValue(null),
        createOriginal: vi.fn().mockResolvedValue(primaryUuid),
        setMultiMode: vi.fn().mockResolvedValue(undefined),
        insertSwitchEvent: vi.fn().mockResolvedValue('event-uuid'),
        transaction: vi.fn(),
    };
    const connectionModel = {
        getProject: vi.fn().mockResolvedValue({
            ...project,
            connectionMode: 'multi',
        }),
        lockProject: vi.fn().mockResolvedValue(undefined),
        createExtra: vi.fn().mockResolvedValue({
            warehouseConnectionUuid: extraUuid,
        }),
        list: vi.fn().mockResolvedValue([]),
    };
    switchModel.transaction.mockImplementation(
        async (
            run: (models: {
                switchModel: WarehouseConnectionSwitchModel;
                connectionModel: WarehouseConnectionModel;
            }) => Promise<unknown>,
        ) =>
            run({
                switchModel:
                    switchModel as unknown as WarehouseConnectionSwitchModel,
                connectionModel:
                    connectionModel as unknown as WarehouseConnectionModel,
            }),
    );
    const analytics = { track: vi.fn<LightdashAnalytics['track']>() };
    const featureFlagService = {
        get: vi
            .fn<FeatureFlagService['get']>()
            .mockImplementation(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled:
                    featureFlagId === FeatureFlags.MixedWarehouseConnections
                        ? mixedTypesEnabled
                        : true,
            })),
    };
    const credentialPolicy = {
        assertCanWriteWarehouseConnection: vi.fn(),
        testWarehouseConnectionCredentialsForSave: vi
            .fn()
            .mockImplementation(
                async (_account, _organizationUuid, warehouseConnection) => ({
                    credentials: warehouseConnection,
                    result: { ok: true, hops: [] },
                }),
            ),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue(summary),
        getWarehouseCredentialsForProject: vi.fn().mockResolvedValue({
            ...credentials,
            requireUserCredentials: true,
        }),
    };
    const service = new WarehouseConnectionSwitchService({
        warehouseConnectionSwitchModel:
            switchModel as unknown as WarehouseConnectionSwitchModel,
        warehouseConnectionModel:
            connectionModel as unknown as WarehouseConnectionModel,
        projectModel,
        featureFlagService,
        licenseService: {
            canHoldMultipleConnections: vi.fn().mockReturnValue(true),
        } as unknown as Pick<LicenseService, 'canHoldMultipleConnections'>,
        credentialPolicy,
        analytics,
    });
    return {
        service,
        switchModel,
        connectionModel,
        analytics,
        credentialPolicy,
        projectModel,
    };
};

describe('WarehouseConnectionSwitchService lifecycle analytics', () => {
    it('tracks a successful preview with the proposed extra connection settings', async () => {
        const { service, analytics } = buildService();

        const plan = await service.preview(account, projectUuid, request);

        expect(plan.planHash).toEqual(expect.any(String));
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connections.switch_previewed',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: null,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'extra',
                credentialSource: 'project',
                connectionCount: 1,
                listAllDatabases: true,
                additionalDatabaseCount: 1,
                originalContentCount: 4,
                personalCredentialsUserCount: 3,
            },
        });
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private_reporting');
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private-password');
    });

    it('tracks a terminal validation failure during preview', async () => {
        const { service, analytics } = buildService();

        await expect(
            service.preview(account, projectUuid, {
                ...request,
                original: { ...request.original, name: ' ' },
            }),
        ).rejects.toThrow('Enter a name');

        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connections.switch_preview_failed',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: null,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: null,
                credentialSource: 'project',
                connectionCount: 1,
                reason: 'invalid_request',
            },
        });
        expect(vi.mocked(analytics.track)).not.toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connections.switch_previewed',
            }),
        );
    });

    it.each([
        {
            credentialSource: 'project' as const,
            connection: request.connection,
        },
        {
            credentialSource: 'organization' as const,
            connection: {
                name: 'Extra',
                organizationWarehouseCredentialsUuid: 'credentials-uuid',
            },
        },
    ])(
        'tracks $credentialSource credentials on a preview refusal',
        async ({ credentialSource, connection }) => {
            const { service, switchModel, analytics } = buildService();
            vi.mocked(switchModel.getProject).mockResolvedValue({
                ...project,
                connectionMode: 'multi',
            });

            await expect(
                service.preview(account, projectUuid, {
                    ...request,
                    connection,
                }),
            ).rejects.toThrow('already has multiple connections');

            expect(vi.mocked(analytics.track)).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'warehouse_connection.action_refused',
                    properties: expect.objectContaining({
                        operation: 'switch_preview',
                        reason: 'already_multi',
                        credentialSource,
                    }),
                }),
            );
        },
    );

    it('tracks a switch only after the transaction completes', async () => {
        const { service, switchModel, connectionModel, analytics } =
            buildService();
        const plan = await service.preview(account, projectUuid, request);
        vi.mocked(analytics.track).mockClear();
        vi.mocked(switchModel.transaction).mockImplementation(
            async (
                run: (models: {
                    switchModel: WarehouseConnectionSwitchModel;
                    connectionModel: WarehouseConnectionModel;
                }) => Promise<unknown>,
            ) => {
                const result = await run({
                    switchModel:
                        switchModel as unknown as WarehouseConnectionSwitchModel,
                    connectionModel:
                        connectionModel as unknown as WarehouseConnectionModel,
                });
                expect(vi.mocked(analytics.track)).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'warehouse_connections.switched_to_multi',
                    }),
                );
                return result;
            },
        );

        const result = await service.execute(account, projectUuid, {
            ...request,
            planHash: plan.planHash,
            idempotencyKey: 'idempotency-key',
        });

        expect(result).toEqual({
            eventUuid: 'event-uuid',
            originalWarehouseConnectionUuid: primaryUuid,
            warehouseConnectionUuid: extraUuid,
        });
        expect(vi.mocked(switchModel.insertSwitchEvent)).toHaveBeenCalledOnce();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connections.switched_to_multi',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: extraUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'extra',
                credentialSource: 'project',
                connectionCount: 2,
                listAllDatabases: true,
                additionalDatabaseCount: 1,
                originalContentCount: 4,
                personalCredentialsUserCount: 3,
            },
        });
    });

    it('tracks a locked gate refusal after the transaction rejects', async () => {
        const { service, switchModel, connectionModel, analytics } =
            buildService();
        const plan = await service.preview(account, projectUuid, request);
        vi.mocked(analytics.track).mockClear();
        vi.mocked(switchModel.getProject)
            .mockResolvedValueOnce(project)
            .mockResolvedValue({ ...project, connectionMode: 'multi' });
        vi.mocked(connectionModel.list).mockResolvedValue([{}, {}, {}]);
        vi.mocked(switchModel.transaction).mockImplementation(async (run) => {
            const listCalls = vi.mocked(connectionModel.list).mock.calls.length;
            const trackCalls = vi.mocked(analytics.track).mock.calls.length;
            try {
                return await run({
                    switchModel:
                        switchModel as unknown as WarehouseConnectionSwitchModel,
                    connectionModel:
                        connectionModel as unknown as WarehouseConnectionModel,
                });
            } catch (error) {
                expect(vi.mocked(connectionModel.list)).toHaveBeenCalledTimes(
                    listCalls,
                );
                expect(vi.mocked(analytics.track)).toHaveBeenCalledTimes(
                    trackCalls,
                );
                throw error;
            }
        });

        await expect(
            service.execute(account, projectUuid, {
                ...request,
                planHash: plan.planHash,
                idempotencyKey: 'locked-gate-key',
            }),
        ).rejects.toThrow('already has multiple connections');

        expect(vi.mocked(connectionModel.list)).toHaveBeenCalledOnce();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connection.action_refused',
                properties: expect.objectContaining({
                    operation: 'switch',
                    reason: 'already_multi',
                    connectionCount: 3,
                }),
            }),
        );
    });

    it('tracks a locked plan change after the transaction rejects', async () => {
        const { service, switchModel, connectionModel, analytics } =
            buildService();
        const plan = await service.preview(account, projectUuid, request);
        vi.mocked(analytics.track).mockClear();
        vi.mocked(switchModel.getProject)
            .mockResolvedValueOnce(project)
            .mockResolvedValue({
                ...project,
                originalCredentialsFingerprint: 'changed-fingerprint',
            });
        vi.mocked(switchModel.transaction).mockImplementation(async (run) => {
            const trackCalls = vi.mocked(analytics.track).mock.calls.length;
            try {
                return await run({
                    switchModel:
                        switchModel as unknown as WarehouseConnectionSwitchModel,
                    connectionModel:
                        connectionModel as unknown as WarehouseConnectionModel,
                });
            } catch (error) {
                expect(vi.mocked(analytics.track)).toHaveBeenCalledTimes(
                    trackCalls,
                );
                expect(vi.mocked(connectionModel.list)).not.toHaveBeenCalled();
                throw error;
            }
        });

        await expect(
            service.execute(account, projectUuid, {
                ...request,
                planHash: plan.planHash,
                idempotencyKey: 'locked-plan-key',
            }),
        ).rejects.toThrow();

        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connection.action_refused',
                properties: expect.objectContaining({
                    operation: 'switch',
                    reason: 'plan_changed',
                    connectionCount: 1,
                }),
            }),
        );
    });
});

describe('WarehouseConnectionSwitchService mixed warehouse types', () => {
    const trinoCredentials: CreateTrinoCredentials = {
        ...credentials,
        type: WarehouseTypes.TRINO,
        port: 8080,
        http_scheme: 'http',
        requireUserCredentials: false,
    };
    const mixedRequest: ApiWarehouseConnectionSwitchRequest = {
        ...request,
        connection: {
            ...request.connection,
            warehouseConnection: trinoCredentials,
            listAllDatabases: false,
            additionalDatabases: [],
        },
    };

    it('refuses a mixed type with the flag off', async () => {
        const { service, credentialPolicy, analytics } = buildService();
        await expect(
            service.preview(account, projectUuid, mixedRequest),
        ).rejects.toThrow(
            'An extra connection must use the same warehouse type as the original connection.',
        );
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).not.toHaveBeenCalled();
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connections.switch_preview_failed',
                properties: expect.objectContaining({
                    reason: 'warehouse_type_mismatch',
                }),
            }),
        );
    });

    it('switches with a Trino extra and keeps its own credential requirement', async () => {
        const { service, connectionModel, credentialPolicy } =
            buildService(true);
        const plan = await service.preview(account, projectUuid, mixedRequest);
        expect(plan.original.warehouseType).toBe(WarehouseTypes.POSTGRES);
        expect(plan.connection.warehouseType).toBe(WarehouseTypes.TRINO);
        await service.execute(account, projectUuid, {
            ...mixedRequest,
            planHash: plan.planHash,
            idempotencyKey: 'mixed-switch',
        });
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).toHaveBeenCalledWith(account, organizationUuid, trinoCredentials);
        expect(connectionModel.createExtra).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                warehouseType: WarehouseTypes.TRINO,
                source: { kind: 'project', credentials: trinoCredentials },
            }),
        );
    });

    it('does not inherit a Postgres credential requirement for a Snowflake extra', async () => {
        const { service, credentialPolicy } = buildService(true);
        await service.preview(account, projectUuid, {
            ...request,
            connection: {
                name: 'Snowflake',
                warehouseConnection: {
                    type: WarehouseTypes.SNOWFLAKE,
                    account: 'account',
                    database: 'database',
                    warehouse: 'warehouse',
                    schema: 'public',
                    user: 'user',
                    password: 'password',
                    requireUserCredentials: false,
                },
            },
        });
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).toHaveBeenCalledWith(
            account,
            organizationUuid,
            expect.objectContaining({
                type: WarehouseTypes.SNOWFLAKE,
                requireUserCredentials: false,
            }),
        );
    });

    it('allows an organization BigQuery extra with the flag on', async () => {
        const { service, connectionModel } = buildService(true);
        const loadOrganizationCredentials = vi
            .fn()
            .mockResolvedValue({ type: WarehouseTypes.BIGQUERY });
        Object.assign(connectionModel, { loadOrganizationCredentials });
        await expect(
            service.preview(account, projectUuid, {
                ...request,
                connection: {
                    name: 'BigQuery',
                    organizationWarehouseCredentialsUuid:
                        'organization-credentials-uuid',
                },
            }),
        ).resolves.toMatchObject({
            connection: expect.objectContaining({
                warehouseType: WarehouseTypes.BIGQUERY,
            }),
        });
    });
});

describe('WarehouseConnectionSwitchService warehouse matrix', () => {
    it.each(Object.values(warehouseConnectionCredentials))(
        'accepts a $type extra with mixed types enabled',
        async (warehouseConnection) => {
            const { service } = buildService(true);
            await expect(
                service.preview(account, projectUuid, {
                    ...request,
                    connection: { name: 'Extra', warehouseConnection },
                }),
            ).resolves.toBeDefined();
        },
    );
    it.each(
        Object.values(warehouseConnectionCredentials).filter(
            (candidate) =>
                candidate.type !== WarehouseTypes.POSTGRES &&
                candidate.type !== WarehouseTypes.ATHENA,
        ),
    )(
        'refuses ignored database settings on a $type extra',
        async (warehouseConnection) => {
            const { service, credentialPolicy } = buildService(true);
            await expect(
                service.preview(account, projectUuid, {
                    ...request,
                    connection: {
                        name: 'Extra',
                        warehouseConnection,
                        additionalDatabases: ['ignored'],
                    },
                }),
            ).rejects.toThrow('Database listing settings are not supported');
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
        },
    );
});

describe('WarehouseConnectionSwitchService primary DuckDB variants', () => {
    it('refuses an analytics primary even when it lacks the provisioning marker', async () => {
        const { service, switchModel, projectModel, credentialPolicy } =
            buildService(true);
        switchModel.getProject.mockResolvedValue({
            ...project,
            originalWarehouseType: WarehouseTypes.DUCKDB,
        });
        projectModel.getWarehouseCredentialsForProject.mockResolvedValue({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.ANALYTICS,
            database: 'memory',
            schema: 'main',
        });
        await expect(
            service.preview(account, projectUuid, {
                ...request,
                connection: { name: 'Extra', warehouseConnection: credentials },
            }),
        ).rejects.toThrow('user-connectable warehouse connection');
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).not.toHaveBeenCalled();
    });
});

describe('switch preview redaction', () => {
    it.each(credentialRedactionCases)(
        'does not expose secrets in the $name plan',
        async ({ credentials: savedCredentials }) => {
            const { service } = buildService(true);
            const response = await service.preview(account, projectUuid, {
                original: {
                    name: 'Primary',
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                connection: {
                    name: 'Extra',
                    warehouseConnection: savedCredentials,
                },
            });
            expect(JSON.stringify(response)).not.toContain('__SECRET_');
        },
    );
});
