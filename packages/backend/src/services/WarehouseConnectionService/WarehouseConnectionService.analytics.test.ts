import { Ability } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type CreatePostgresCredentials,
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
    const service = new WarehouseConnectionService({
        warehouseConnectionModel: model as unknown as WarehouseConnectionModel,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue(summary),
            getWarehouseCredentialsForProject: vi
                .fn()
                .mockResolvedValue(credentials),
        } as unknown as Pick<
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
    return { service, model, analytics, featureFlagService, credentialPolicy };
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
            model.get.mockResolvedValue(connection(extraUuid, false));
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
            model.get.mockResolvedValue(connection(extraUuid, false));
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
            ).toEqual([
                [
                    {
                        user: {
                            userUuid: account.user.userUuid,
                            organizationUuid,
                        },
                        featureFlagId: FeatureFlags.MixedWarehouseConnections,
                    },
                ],
            ]);
            expect(analytics.track).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'warehouse_connection.action_refused',
                }),
            );
        },
    );

    it.each(['create', 'update'] as const)(
        'refuses a BigQuery organization extra with the flag on on %s',
        async (operation) => {
            const { service, model } = buildService(true);
            model.get.mockResolvedValue(connection(extraUuid, false));
            model.loadOrganizationCredentials.mockResolvedValue({
                type: WarehouseTypes.BIGQUERY,
            });
            const request = {
                name: 'BigQuery',
                organizationWarehouseCredentialsUuid:
                    'organization-credentials-uuid',
            };
            await expect(
                operation === 'create'
                    ? service.create(account, projectUuid, request)
                    : service.update(account, projectUuid, extraUuid, request),
            ).rejects.toThrow(
                'An extra connection must use the same warehouse type as the original connection.',
            );
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
            ).toHaveLength(1);
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
