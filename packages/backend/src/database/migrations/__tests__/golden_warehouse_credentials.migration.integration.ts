import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    ProjectType,
    QueryExecutionContext,
    WarehouseTypes,
    type Account,
    type CreatePostgresCredentials,
    type WarehouseClient,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { RefreshTokenRotation } from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { AiAccessService } from '../../../services/AiAccessService/AiAccessService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { buildAccount } from '../../../services/ProjectService/ProjectService.mock';
import { connectionContextFromAccount } from '../../../services/WarehouseClientFactory/ConnectionContext';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    warehouseClientFromCredentials: vi.fn(),
}));

const shared: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.example.test',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    user: 'shared_reader',
    password: 'synthetic-shared-password',
    sslmode: 'require',
    useSshTunnel: false,
};

const personal: Pick<CreatePostgresCredentials, 'type' | 'user' | 'password'> =
    {
        type: WarehouseTypes.POSTGRES,
        user: 'personal_reader',
        password: 'synthetic-personal-password',
    };

const requesters = [
    {
        name: 'browser',
        accountType: 'session',
        context: QueryExecutionContext.EXPLORE,
        column: 'person',
        person: 'person',
        agentSessions: [false, false],
    },
    {
        name: 'pat',
        accountType: 'pat',
        context: QueryExecutionContext.API,
        column: 'person',
        person: 'person',
        agentSessions: [false, false],
    },
    {
        name: 'service-account',
        accountType: 'service-account',
        context: QueryExecutionContext.API,
        column: 'serviceAccount',
        person: 'service-account',
        agentSessions: [false, false],
    },
    {
        name: 'oauth-mcp',
        accountType: 'oauth',
        context: QueryExecutionContext.MCP_RUN_SQL,
        column: 'person',
        person: 'person',
        agentSessions: [true, false],
    },
    {
        name: 'oauth-cli',
        accountType: 'oauth',
        context: QueryExecutionContext.CLI,
        column: 'person',
        person: 'person',
        agentSessions: [false, false],
    },
    {
        name: 'embed',
        accountType: 'jwt',
        context: QueryExecutionContext.EMBED,
        column: 'embed',
        person: 'embed',
        agentSessions: [false, false],
    },
] as const;

const outcomes = {
    shared: {
        outcome: 'allowed',
        mode: 'shared',
        identity: 'shared_reader',
        refusal: null,
    },
    extra: {
        outcome: 'allowed',
        mode: 'shared',
        identity: 'extra_reader',
        refusal: null,
    },
    personal: {
        outcome: 'allowed',
        mode: 'personal',
        identity: 'personal_reader',
        refusal: null,
    },
    missing: {
        outcome: 'refused',
        mode: null,
        identity: null,
        refusal: {
            name: 'MissingWarehouseCredentialsError',
            reason: "You don't have warehouse credentials set up for this project. Add them under 'User settings' → 'My warehouse connections', or refresh the page to sign in again.",
        },
    },
    serviceAccount: {
        outcome: 'refused',
        mode: null,
        identity: null,
        refusal: {
            name: 'ForbiddenError',
            reason: 'Service accounts cannot run queries when user credentials are required.',
        },
    },
    embed: {
        outcome: 'refused',
        mode: null,
        identity: null,
        refusal: {
            name: 'ForbiddenError',
            reason: 'Embedded users cannot use personal warehouse credentials',
        },
    },
} as const;

const golden = [
    {
        project: 'shared',
        route: 'single',
        base: 'original',
        parent: null,
        person: 'shared',
        serviceAccount: 'shared',
        embed: 'shared',
    },
    {
        project: 'required-saved',
        route: 'single',
        base: 'original',
        parent: null,
        person: 'personal',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
    {
        project: 'required-missing',
        route: 'single',
        base: 'original',
        parent: null,
        person: 'missing',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
    {
        project: 'preview-shared',
        route: 'single',
        base: 'original',
        parent: 'shared',
        person: 'shared',
        serviceAccount: 'shared',
        embed: 'shared',
    },
    {
        project: 'preview-required-saved',
        route: 'single',
        base: 'original',
        parent: 'required-saved',
        person: 'personal',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
    {
        project: 'preview-parent-only',
        route: 'single',
        base: 'original',
        parent: 'required-saved',
        person: 'missing',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
    {
        project: 'extra-shared',
        route: 'multi',
        base: 'extra',
        parent: null,
        person: 'extra',
        serviceAccount: 'extra',
        embed: 'extra',
    },
    {
        project: 'extra-required-saved',
        route: 'multi',
        base: 'extra',
        parent: null,
        person: 'personal',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
    {
        project: 'extra-required-missing',
        route: 'multi',
        base: 'extra',
        parent: null,
        person: 'missing',
        serviceAccount: 'serviceAccount',
        embed: 'embed',
    },
] as const;

const credentialStores = [
    'warehouse_credentials',
    'user_warehouse_credentials',
    'warehouse_connections',
    'organization_warehouse_credentials',
] as const;

describe('golden warehouse credentials at main 74945202a0', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('golden_credentials', {
            edition: 'community',
        });
        database = migrated.database;
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const cases = [false, true].flatMap((enabled) =>
        golden.flatMap((row) =>
            requesters.map((requester) => ({ enabled, row, requester })),
        ),
    );

    test.each(cases)(
        'flag=$enabled, $row.project, $requester.name',
        async ({ enabled, row, requester }) => {
            expect(agentExecutionContext.getStore()).toBeUndefined();
            const config = {
                ...lightdashConfigMock,
                enabledFeatureFlags: new Set<string>(),
                disabledFeatureFlags: new Set<string>(),
                previewFeatureFlags: { enabled: false },
            };
            const projectModel = new ProjectModel({
                database,
                encryptionUtil,
                lightdashConfig: config,
            });
            const userWarehouseCredentialsModel =
                new UserWarehouseCredentialsModel({ database, encryptionUtil });
            const organizationWarehouseCredentialsModel =
                new OrganizationWarehouseCredentialsModel({
                    database,
                    encryptionUtil,
                });
            const warehouseConnectionModel = new WarehouseConnectionModel({
                database,
                encryptionUtil,
                organizationWarehouseCredentialsModel,
            });
            const featureFlagModel = new FeatureFlagModel({
                database,
                lightdashConfig: config,
            });
            const aiAccessService = new AiAccessService({
                lightdashConfig: config,
                featureFlagModel,
                projectModel,
                userWarehouseCredentialsModel,
                warehouseConnectionModel,
            } as never);
            const service = new ProjectService({
                lightdashConfig: config,
                projectModel,
                userWarehouseCredentialsModel,
                organizationWarehouseCredentialsModel,
                warehouseConnectionModel,
                featureFlagModel,
                aiAccessService,
                refreshTokenRotation:
                    RefreshTokenRotation.forDatabase(database),
            } as never);
            const [organization] = await database('organizations')
                .insert({ organization_name: 'Golden credentials' })
                .returning('organization_uuid');
            const [user] = await database('users')
                .insert({ first_name: 'Golden', last_name: 'Person' } as never)
                .returning('user_uuid');
            const organizationUuid = organization.organization_uuid;
            const userUuid = user.user_uuid;
            await database('feature_flags')
                .insert({
                    flag_id: FeatureFlags.AgentIdentity,
                    default_enabled: false,
                })
                .onConflict('flag_id')
                .ignore();
            await database('feature_flag_overrides').insert({
                flag_id: FeatureFlags.AgentIdentity,
                organization_uuid: organizationUuid,
                enabled,
            });
            expect(
                (
                    await featureFlagModel.get({
                        featureFlagId: FeatureFlags.AgentIdentity,
                        user: { organizationUuid, userUuid },
                    })
                ).enabled,
            ).toBe(enabled);

            const required = ![
                'shared',
                'preview-shared',
                'extra-shared',
            ].includes(row.project);
            const createProject = (
                name: string,
                credentials: CreatePostgresCredentials,
                parent: string | null = null,
            ) =>
                projectModel.create(userUuid, organizationUuid, {
                    name,
                    type:
                        parent === null
                            ? ProjectType.DEFAULT
                            : ProjectType.PREVIEW,
                    dbtConnection: { type: DbtProjectType.NONE },
                    dbtVersion: DefaultSupportedDbtVersion,
                    warehouseConnection: credentials,
                    ...(parent === null ? {} : { upstreamProjectUuid: parent }),
                });
            const parentUuid =
                row.parent === null
                    ? null
                    : await createProject(row.parent, {
                          ...shared,
                          requireUserCredentials: required,
                      });
            const projectUuid = await createProject(
                row.project,
                parentUuid === null
                    ? { ...shared, requireUserCredentials: required }
                    : ((await projectModel.getWarehouseCredentialsForProject(
                          parentUuid,
                      )) as CreatePostgresCredentials),
                parentUuid,
            );
            const summary = await projectModel.getSummary(projectUuid);
            const previewParent =
                (summary.upstreamProjectUuid ?? null) === parentUuid
                    ? row.parent
                    : 'unexpected-parent';
            let warehouseConnectionUuid: string | null = null;
            if (row.base === 'extra') {
                await database('projects')
                    .where('project_uuid', projectUuid)
                    .update({ connection_mode: 'multi' } as never);
                await database('warehouse_connections').insert({
                    project_uuid: projectUuid,
                    name: 'Original',
                    is_original: true,
                });
                const extra = await warehouseConnectionModel.createExtra(
                    await warehouseConnectionModel.getProject(projectUuid),
                    {
                        name: 'Extra',
                        warehouseType: WarehouseTypes.POSTGRES,
                        source: {
                            kind: 'project',
                            credentials: {
                                ...shared,
                                host: 'extra.example.test',
                                port: 5433,
                                user: 'extra_reader',
                                password: 'synthetic-extra-password',
                                requireUserCredentials: required,
                            },
                        },
                        listAllDatabases: false,
                        additionalDatabases: [],
                        createdByUserUuid: userUuid,
                    },
                );
                warehouseConnectionUuid = extra.warehouseConnectionUuid;
            }
            const hasSaved =
                row.project.endsWith('saved') ||
                row.project === 'preview-parent-only';
            if (hasSaved) {
                const credentialUuid =
                    await userWarehouseCredentialsModel.create(
                        userUuid,
                        { name: 'Personal reader', credentials: personal },
                        { strictPersonalOverlay: false },
                        row.project === 'preview-parent-only'
                            ? parentUuid!
                            : projectUuid,
                    );
                if (warehouseConnectionUuid !== null)
                    await warehouseConnectionModel.upsertUserCredentialsPreference(
                        {
                            userUuid,
                            warehouseConnectionUuid,
                            userWarehouseCredentialsUuid: credentialUuid,
                        },
                    );
            }

            const baseAccount = buildAccount({
                accountType: requester.accountType,
                userType:
                    requester.name === 'embed' ? 'anonymous' : 'registered',
            });
            const account: Account = {
                ...baseAccount,
                user: { ...baseAccount.user, id: userUuid, userUuid },
                organization: { ...baseAccount.organization, organizationUuid },
                authentication: baseAccount.authentication,
            } as Account;
            if (requester.accountType === 'oauth') {
                account.authentication = {
                    type: 'oauth',
                    source: 'synthetic-bearer',
                    token: 'synthetic-bearer',
                    clientId: requester.name,
                    scopes: [],
                    agentConnectionGrant: null,
                };
            } else if (requester.accountType === 'service-account') {
                account.authentication = {
                    type: 'service-account',
                    source: 'synthetic-service-token',
                    serviceAccountUuid: userUuid,
                    serviceAccountDescription: 'Golden service',
                };
            }
            const context = connectionContextFromAccount(account, {
                organizationUuid,
                queryContext: requester.context,
            });
            expect(context.agentIdentity).toBeNull();
            const expected = outcomes[row[requester.column]];
            const stores = new Set<string>();
            const recordQuery = ({ sql }: { sql: string }) => {
                if (/^select\b/i.test(sql))
                    credentialStores.forEach((store) => {
                        if (sql.includes(`"${store}"`)) stores.add(store);
                    });
            };
            const loaded = vi.spyOn(service, 'loadBase');
            const buildClient = vi
                .mocked(warehouseClientFromCredentials)
                .mockReset()
                .mockImplementation(
                    (credentials) => ({ credentials }) as WarehouseClient,
                );
            database.on('query', recordQuery);
            let actual;
            let base;
            try {
                actual =
                    await service.warehouseClientFactory.withWarehouseClient(
                        {
                            kind: 'binding',
                            projectUuid,
                            binding:
                                warehouseConnectionUuid === null
                                    ? { kind: 'original' }
                                    : {
                                          kind: 'connection',
                                          warehouseConnectionUuid,
                                      },
                        },
                        context,
                        async (connection) => {
                            const credentials = buildClient.mock.calls[0][0];
                            if (credentials.type !== WarehouseTypes.POSTGRES)
                                throw new Error(
                                    'Expected Postgres credentials',
                                );
                            expect(buildClient).toHaveBeenCalledTimes(1);
                            let expectedPassword = shared.password;
                            if (expected.mode === 'personal')
                                expectedPassword = personal.password;
                            else if (row.base === 'extra')
                                expectedPassword = 'synthetic-extra-password';
                            expect(credentials.password).toBe(expectedPassword);
                            expect(connection.aiPlan).toBeNull();
                            return {
                                outcome: 'allowed',
                                mode: connection.credentialKind,
                                identity: credentials.user,
                                destination: {
                                    host: credentials.host,
                                    port: credentials.port,
                                    database: credentials.dbname,
                                    schema: credentials.schema,
                                },
                                transport: {
                                    sslmode: credentials.sslmode,
                                    useSshTunnel: credentials.useSshTunnel,
                                    agentSession:
                                        buildClient.mock.calls[0][1]
                                            ?.agentSession,
                                },
                                refusal: null,
                            };
                        },
                    );
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                actual = {
                    outcome: 'refused',
                    mode: null,
                    identity: null,
                    destination: null,
                    transport: null,
                    refusal: { name: error.name, reason: error.message },
                };
                expect(buildClient).not.toHaveBeenCalled();
            } finally {
                database.removeListener('query', recordQuery);
                base = await loaded.mock.results[0]?.value;
                loaded.mockRestore();
            }
            expect({
                ...actual,
                route: base?.connectionRoute?.route,
                source: base?.kind,
                person: {
                    subject:
                        context.actor.person?.userUuid === userUuid
                            ? 'requester'
                            : null,
                    registered: context.actor.person?.isRegisteredUser,
                    serviceAccount: context.actor.person?.isServiceAccount,
                    oauthClientId: context.actor.person?.oauthClientId,
                },
                stores: [...stores].sort(),
                previewParent,
            }).toEqual({
                ...expected,
                route: row.route,
                source: row.base,
                person: {
                    subject: 'requester',
                    registered: requester.person !== 'embed',
                    serviceAccount: requester.person === 'service-account',
                    oauthClientId:
                        requester.accountType === 'oauth'
                            ? requester.name
                            : null,
                },
                stores: [
                    'warehouse_credentials',
                    ...(row.base === 'extra' ? ['warehouse_connections'] : []),
                    ...(['personal', 'missing'].includes(row[requester.column])
                        ? ['user_warehouse_credentials']
                        : []),
                ].sort(),
                previewParent: row.parent,
                destination:
                    expected.outcome === 'allowed'
                        ? {
                              host:
                                  row.base === 'extra'
                                      ? 'extra.example.test'
                                      : 'warehouse.example.test',
                              port: row.base === 'extra' ? 5433 : 5432,
                              database: 'analytics',
                              schema: 'public',
                          }
                        : null,
                transport:
                    expected.outcome === 'allowed'
                        ? {
                              sslmode: 'require',
                              useSshTunnel: false,
                              agentSession:
                                  requester.agentSessions[Number(enabled)],
                          }
                        : null,
            });
        },
    );
});
