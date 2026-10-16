import { Ability } from '@casl/ability';
import {
    BigqueryAuthenticationType,
    ConflictError,
    DuckdbConnectionType,
    FeatureFlags,
    ParameterError,
    ProjectType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateTrinoCredentials,
    type PossibleAbilities,
    type ProjectSummary,
    type WarehouseConnection,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';
import { credentialRedactionCases } from './credentialRedactionFixtures.mock';
import { warehouseConnectionCredentials } from './warehouseConnectionFixtures.mock';
import { WarehouseConnectionService } from './WarehouseConnectionService';

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

const project = {
    projectUuid,
    organizationUuid,
    connectionMode: 'multi' as const,
    originalWarehouseType: WarehouseTypes.POSTGRES,
};

const summary = {
    projectUuid,
    organizationUuid,
    name: 'Project',
    provisioningSource: null,
    type: ProjectType.DEFAULT,
} as ProjectSummary;

const connection = (
    warehouseConnectionUuid: string,
    isOriginal: boolean,
): WarehouseConnection => ({
    warehouseConnectionUuid,
    projectUuid,
    name: isOriginal ? 'Primary' : 'Extra',
    isOriginal,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'user',
    password: 'password',
    port: 5432,
    dbname: 'database',
    schema: 'public',
    requireUserCredentials: true,
};
const trinoCredentials: CreateTrinoCredentials = {
    ...credentials,
    type: WarehouseTypes.TRINO,
    port: 8080,
    http_scheme: 'http',
    requireUserCredentials: false,
};

const buildService = (mixedTypesEnabled = false) => {
    let primary = connection(primaryUuid, true);
    const extra = connection(extraUuid, false);
    const model = {
        getProject: vi.fn().mockResolvedValue(project),
        get: vi.fn().mockImplementation(async () => primary),
        list: vi.fn().mockImplementation(async () => [primary, extra]),
        lockProject: vi.fn().mockResolvedValue(undefined),
        updateListingSettings: vi
            .fn()
            .mockImplementation(async (_project, _uuid, settings) => {
                primary = { ...primary, ...settings };
            }),
        getBoundContent: vi.fn().mockResolvedValue({
            explores: ['private_explore'],
            dbtSources: [],
            sqlCharts: [],
            inFlightQueries: 0,
        }),
        clearOlderSqlChartVersionBindings: vi.fn(),
        deleteExtra: vi.fn(),
        insertEvent: vi.fn(),
        createExtra: vi.fn().mockResolvedValue({
            ...extra,
            warehouseType: WarehouseTypes.TRINO,
        }),
        updateExtraCredentials: vi.fn(),
        getCredentials: vi.fn().mockResolvedValue(credentials),
        loadOrganizationCredentials: vi.fn(),
        getExtraCredentialSource: vi.fn(),
        transaction: vi.fn(),
    };
    model.transaction.mockImplementation(
        async (
            run: (
                transactionModel: WarehouseConnectionModel,
            ) => Promise<unknown>,
        ) => run(model as unknown as WarehouseConnectionModel),
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
        getWarehouseCredentialsForProject: vi
            .fn()
            .mockResolvedValue(credentials),
    };
    const service = new WarehouseConnectionService({
        warehouseConnectionModel: model as unknown as WarehouseConnectionModel,
        projectModel: projectModel as unknown as Pick<
            ProjectModel,
            'getSummary' | 'getWarehouseCredentialsForProject'
        >,
        userWarehouseCredentialsModel: {
            getByUuid: vi.fn(),
        } as unknown as Pick<UserWarehouseCredentialsModel, 'getByUuid'>,
        featureFlagService,
        licenseService: {
            canHoldMultipleConnections: vi.fn().mockReturnValue(true),
        } as unknown as Pick<LicenseService, 'canHoldMultipleConnections'>,
        credentialPolicy,
        analytics,
    });
    return {
        service,
        model,
        analytics,
        featureFlagService,
        credentialPolicy,
        projectModel,
    };
};

describe('WarehouseConnectionService lifecycle analytics', () => {
    it('tracks the saved SQL runner listing settings for the primary connection', async () => {
        const { service, model, analytics } = buildService();

        await service.update(account, projectUuid, primaryUuid, {
            listAllDatabases: true,
            additionalDatabases: ['private_database'],
        });

        expect(vi.mocked(model.updateListingSettings)).toHaveBeenCalledWith(
            project,
            primaryUuid,
            {
                listAllDatabases: true,
                additionalDatabases: ['private_database'],
            },
        );
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connection.updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: primaryUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'primary',
                credentialSource: 'project',
                connectionCount: 2,
                listAllDatabases: true,
                additionalDatabaseCount: 1,
                changedCredentials: false,
                changedDatabaseSettings: true,
            },
        });
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private_database');
    });

    it('tracks a bound-content removal refusal without deleting the connection', async () => {
        const { service, model, analytics } = buildService();
        vi.mocked(model.get).mockResolvedValue(connection(extraUuid, false));
        vi.mocked(model.transaction).mockImplementation(async (run) => {
            try {
                return await run(model as unknown as WarehouseConnectionModel);
            } catch (error) {
                expect(vi.mocked(model.list)).not.toHaveBeenCalled();
                expect(vi.mocked(analytics.track)).not.toHaveBeenCalled();
                throw error;
            }
        });

        await expect(
            service.delete(account, projectUuid, extraUuid),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(vi.mocked(model.deleteExtra)).not.toHaveBeenCalled();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            event: 'warehouse_connection.action_refused',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: extraUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                connectionKind: 'extra',
                credentialSource: null,
                connectionCount: 2,
                operation: 'remove',
                reason: 'bound_content',
            },
        });
        expect(
            JSON.stringify(vi.mocked(analytics.track).mock.calls),
        ).not.toContain('private_explore');
    });

    it('classifies a refused original-connection removal as primary', async () => {
        const { service, model, analytics } = buildService();
        vi.mocked(model.transaction).mockImplementation(async (run) => {
            try {
                return await run(model as unknown as WarehouseConnectionModel);
            } catch (error) {
                expect(vi.mocked(model.list)).not.toHaveBeenCalled();
                expect(vi.mocked(analytics.track)).not.toHaveBeenCalled();
                throw error;
            }
        });

        await expect(
            service.delete(account, projectUuid, primaryUuid),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(vi.mocked(model.deleteExtra)).not.toHaveBeenCalled();
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'warehouse_connection.action_refused',
                properties: expect.objectContaining({
                    warehouseConnectionId: primaryUuid,
                    connectionKind: 'primary',
                    operation: 'remove',
                    reason: 'original_connection',
                }),
            }),
        );
    });
});

describe('WarehouseConnectionService mixed warehouse types', () => {
    it.each(['create', 'update'] as const)(
        'refuses a Trino extra with the flag off on %s',
        async (operation) => {
            const { service, model, analytics, credentialPolicy } =
                buildService();
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: WarehouseTypes.TRINO,
            });
            model.getCredentials.mockResolvedValue(trinoCredentials);
            const request = {
                name: 'Trino',
                warehouseConnection: trinoCredentials,
            };
            await expect(
                operation === 'create'
                    ? service.create(account, projectUuid, request)
                    : service.update(account, projectUuid, extraUuid, request),
            ).rejects.toThrow(
                'An extra connection must use the same warehouse type as the original connection.',
            );
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'warehouse_connection.action_refused',
                    properties: expect.objectContaining({
                        reason: 'warehouse_type_mismatch',
                    }),
                }),
            );
        },
    );

    it.each(['create', 'update'] as const)(
        'allows a Trino extra with its own credential requirement on %s',
        async (operation) => {
            const {
                service,
                model,
                analytics,
                featureFlagService,
                credentialPolicy,
            } = buildService(true);
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: WarehouseTypes.TRINO,
            });
            model.getCredentials.mockResolvedValue(trinoCredentials);
            const request = {
                name: 'Trino',
                warehouseConnection: trinoCredentials,
            };
            await (operation === 'create'
                ? service.create(account, projectUuid, request)
                : service.update(account, projectUuid, extraUuid, request));
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).toHaveBeenCalledWith(
                account,
                organizationUuid,
                expect.objectContaining({
                    type: WarehouseTypes.TRINO,
                    requireUserCredentials: false,
                }),
            );
            const savedSource =
                operation === 'create'
                    ? model.createExtra.mock.calls[0][1].source
                    : model.updateExtraCredentials.mock.calls[0][2];
            expect(savedSource).toEqual({
                kind: 'project',
                credentials: trinoCredentials,
            });
            expect(
                featureFlagService.get.mock.calls.filter(
                    ([args]) =>
                        args.featureFlagId ===
                        FeatureFlags.MixedWarehouseConnections,
                ),
            ).toContainEqual([
                {
                    user: {
                        userUuid: account.user.userUuid,
                        organizationUuid,
                    },
                    featureFlagId: FeatureFlags.MixedWarehouseConnections,
                },
            ]);
            expect(analytics.track).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'warehouse_connection.action_refused',
                }),
            );
        },
    );

    it.each(['create', 'update'] as const)(
        'allows a BigQuery organization extra with the flag on on %s',
        async (operation) => {
            const { service, model } = buildService(true);
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: WarehouseTypes.BIGQUERY,
            });
            model.loadOrganizationCredentials.mockResolvedValue({
                type: WarehouseTypes.BIGQUERY,
            });
            const request = {
                name: 'BigQuery',
                organizationWarehouseCredentialsUuid:
                    'organization-credentials-uuid',
            };
            await (operation === 'create'
                ? service.create(account, projectUuid, request)
                : service.update(account, projectUuid, extraUuid, request));
            expect(model.loadOrganizationCredentials).toHaveBeenCalled();
        },
    );

    it.each(['create', 'update'] as const)(
        'rechecks the warehouse type inside the %s transaction with the same flag value',
        async (operation) => {
            const { service, model, featureFlagService } = buildService();
            model.get.mockResolvedValue(connection(extraUuid, false));
            model.getProject.mockResolvedValueOnce(project).mockResolvedValue({
                ...project,
                originalWarehouseType: WarehouseTypes.SNOWFLAKE,
            });
            const request = { name: 'Extra', warehouseConnection: credentials };
            await expect(
                operation === 'create'
                    ? service.create(account, projectUuid, request)
                    : service.update(account, projectUuid, extraUuid, request),
            ).rejects.toThrow(
                'An extra connection must use the same warehouse type as the original connection.',
            );
            expect(model.createExtra).not.toHaveBeenCalled();
            expect(model.updateExtraCredentials).not.toHaveBeenCalled();
            expect(
                featureFlagService.get.mock.calls.filter(
                    ([args]) =>
                        args.featureFlagId ===
                        FeatureFlags.MixedWarehouseConnections,
                ),
            ).toHaveLength(operation === 'create' ? 2 : 1);
        },
    );

    it('keeps primary credential inheritance for the same warehouse type with the flag off', async () => {
        const { service, model, credentialPolicy } = buildService();
        await service.create(account, projectUuid, {
            name: 'Extra',
            warehouseConnection: {
                ...credentials,
                requireUserCredentials: false,
            },
        });
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).toHaveBeenCalledWith(
            account,
            organizationUuid,
            expect.objectContaining({ requireUserCredentials: true }),
        );
        expect(
            model.createExtra.mock.calls[0][1].source.credentials
                .requireUserCredentials,
        ).toBe(true);
    });
});

describe('WarehouseConnectionService warehouse matrix', () => {
    it.each([
        {
            ...(warehouseConnectionCredentials[
                WarehouseTypes.BIGQUERY
            ] as CreateBigqueryCredentials),
            type: WarehouseTypes.BIGQUERY as const,
            authenticationType: BigqueryAuthenticationType.SSO,
            requireUserCredentials: true,
        },
        {
            ...(warehouseConnectionCredentials[
                WarehouseTypes.REDSHIFT
            ] as CreateRedshiftCredentials),
            type: WarehouseTypes.REDSHIFT as const,
            authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
            requireUserCredentials: true,
        },
    ])(
        'refuses personal-only $type credentials before saving',
        async (warehouseConnection) => {
            const { service, model, credentialPolicy } = buildService(true);
            await expect(
                service.create(account, projectUuid, {
                    name: 'Extra',
                    warehouseConnection,
                }),
            ).rejects.toThrow(ParameterError);
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: warehouseConnection.type,
            });
            await expect(
                service.update(account, projectUuid, extraUuid, {
                    warehouseConnection,
                }),
            ).rejects.toThrow('compilation requires shared credentials');
            expect(model.createExtra).not.toHaveBeenCalled();
            expect(model.updateExtraCredentials).not.toHaveBeenCalled();
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
        },
    );
    it.each(Object.values(warehouseConnectionCredentials))(
        'allows $type on a Postgres primary with mixed types enabled',
        async (warehouseConnection) => {
            const { service, model } = buildService(true);
            await service.create(account, projectUuid, {
                name: warehouseConnection.type,
                warehouseConnection,
            });
            expect(model.createExtra).toHaveBeenCalledWith(
                project,
                expect.objectContaining({
                    warehouseType: warehouseConnection.type,
                }),
            );
        },
    );
    it.each(
        Object.values(warehouseConnectionCredentials).filter(
            (value) => value.type !== WarehouseTypes.POSTGRES,
        ),
    )(
        'refuses $type on a Postgres primary with mixed types disabled',
        async (warehouseConnection) => {
            const { service, model, credentialPolicy } = buildService(false);
            await expect(
                service.create(account, projectUuid, {
                    name: warehouseConnection.type,
                    warehouseConnection,
                }),
            ).rejects.toThrow('same warehouse type');
            expect(model.createExtra).not.toHaveBeenCalled();
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
        },
    );
    it.each(['project', 'organization'] as const)(
        'refuses internal analytics from %s credentials',
        async (kind) => {
            const { service, model } = buildService(true);
            const warehouseConnection = {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.ANALYTICS,
                database: 'memory',
                schema: 'main',
            } as const;
            model.loadOrganizationCredentials.mockResolvedValue(
                warehouseConnection,
            );
            await expect(
                service.create(account, projectUuid, {
                    name: 'Analytics',
                    ...(kind === 'project'
                        ? { warehouseConnection }
                        : {
                              organizationWarehouseCredentialsUuid:
                                  'org-credentials',
                          }),
                }),
            ).rejects.toThrow('Internal analytics');
            expect(model.createExtra).not.toHaveBeenCalled();
        },
    );
});

describe('WarehouseConnectionService database listing validation', () => {
    it.each(
        Object.values(warehouseConnectionCredentials).filter(
            (candidate) =>
                candidate.type !== WarehouseTypes.POSTGRES &&
                candidate.type !== WarehouseTypes.ATHENA,
        ),
    )(
        'refuses database listing on $type at create and update',
        async (warehouseConnection) => {
            const { service, model, credentialPolicy } = buildService(true);
            await expect(
                service.create(account, projectUuid, {
                    name: 'Extra',
                    warehouseConnection,
                    additionalDatabases: ['ignored'],
                }),
            ).rejects.toThrow('Database listing settings are not supported');
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: warehouseConnection.type,
            });
            await expect(
                service.update(account, projectUuid, extraUuid, {
                    listAllDatabases: true,
                }),
            ).rejects.toThrow('Database listing settings are not supported');
            expect(model.createExtra).not.toHaveBeenCalled();
            expect(model.updateListingSettings).not.toHaveBeenCalled();
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
        },
    );
});

describe('WarehouseConnectionService primary DuckDB variants', () => {
    it('refuses an analytics primary before testing the extra', async () => {
        const { service, model, projectModel, credentialPolicy } =
            buildService(true);
        model.getProject.mockResolvedValue({
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
            service.create(account, projectUuid, {
                name: 'Extra',
                warehouseConnection: trinoCredentials,
            }),
        ).rejects.toThrow('user-connectable warehouse connection');
        expect(
            credentialPolicy.testWarehouseConnectionCredentialsForSave,
        ).not.toHaveBeenCalled();
        expect(model.createExtra).not.toHaveBeenCalled();
    });
});

describe('connection details credential redaction', () => {
    it.each(credentialRedactionCases)(
        'removes every secret value from $name',
        async ({ credentials: savedCredentials }) => {
            const { service, model } = buildService(true);
            model.get.mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: savedCredentials.type,
            });
            model.getExtraCredentialSource.mockResolvedValue({
                organizationWarehouseCredentialsUuid: null,
                credentials: savedCredentials,
            });
            const response = await service.get(account, projectUuid, extraUuid);
            expect(response.warehouseConnection?.type).toBe(
                savedCredentials.type,
            );
            expect(JSON.stringify(response)).not.toContain('__SECRET_');
            expect(
                JSON.stringify(await service.list(account, projectUuid)),
            ).not.toContain('__SECRET_');
        },
    );
});

describe('connection type immutability', () => {
    it.each(
        [false, true].flatMap((enabled) =>
            ['project', 'organization'].map((source) => ({ enabled, source })),
        ),
    )(
        'refuses a type change with flag $enabled and $source credentials',
        async ({ enabled, source }) => {
            const { service, model, credentialPolicy } = buildService(enabled);
            model.get.mockResolvedValue(connection(extraUuid, false));
            model.loadOrganizationCredentials.mockResolvedValue(
                trinoCredentials,
            );
            await expect(
                service.update(
                    account,
                    projectUuid,
                    extraUuid,
                    source === 'project'
                        ? { warehouseConnection: trinoCredentials }
                        : {
                              organizationWarehouseCredentialsUuid:
                                  'org-credentials',
                          },
                ),
            ).rejects.toThrow(
                "A connection's warehouse type cannot be changed. Add a new connection instead.",
            );
            expect(model.transaction).not.toHaveBeenCalled();
            expect(
                credentialPolicy.testWarehouseConnectionCredentialsForSave,
            ).not.toHaveBeenCalled();
        },
    );
    it('rechecks the existing type after the project lock', async () => {
        const { service, model } = buildService(true);
        model.get
            .mockResolvedValueOnce(connection(extraUuid, false))
            .mockResolvedValue({
                ...connection(extraUuid, false),
                warehouseType: WarehouseTypes.TRINO,
            });
        await expect(
            service.update(account, projectUuid, extraUuid, {
                warehouseConnection: credentials,
            }),
        ).rejects.toThrow(
            "A connection's warehouse type cannot be changed. Add a new connection instead.",
        );
        expect(model.updateExtraCredentials).not.toHaveBeenCalled();
    });
});
