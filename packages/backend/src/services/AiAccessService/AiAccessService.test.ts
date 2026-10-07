import { Ability } from '@casl/ability';
import {
    AI_DIRECT_TRANSPORT,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    AiPrincipalKind,
    ForbiddenError,
    QueryExecutionContext,
    WarehouseTypes,
    type AiAccessPolicy,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type AiAccessPolicyModel } from '../../models/AiAccessPolicyModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { AiAccessService, type ResolvePlanArgs } from './AiAccessService';
import {
    aiAgentMarkerMock,
    aiExecutionPlanMock,
    markedPersonPlanMock,
} from './AiAccessService.mock';
import {
    AiSessionFailureReason,
    type AiCredentialProvider,
    type AiMintedCredentials,
    type AiSessionProbeResult,
} from './providers/AiCredentialProvider';
import { createAiCredentialProviderRegistry } from './providers/registry';
import { SnowflakeAiCredentialProvider } from './providers/SnowflakeAiCredentialProvider';

const connection: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    user: 'connection',
    password: 'test',
    dbname: 'test',
    schema: 'public',
};
const snowflake: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'person',
    password: 'test',
    database: 'test',
    warehouse: 'test',
    schema: 'public',
};

const args: ResolvePlanArgs = {
    projectUuid: 'project',
    organizationUuid: 'org',
    warehouseConnectionUuid: null,
    connection,
    context: QueryExecutionContext.AI,
    userUuid: 'user',
    isRegisteredUser: true,
    isServiceAccount: false,
};
const policy: AiAccessPolicy = {
    aiAccessPolicyUuid: 'policy',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    enabled: true,
    principalKind: AiPrincipalKind.PERSON,
    transport: AI_DIRECT_TRANSPORT,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const account = buildAccount();
account.user.ability = new Ability<PossibleAbilities>([
    { action: 'manage', subject: 'Project' },
]);
const viewer = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { action: 'view', subject: 'Project' },
        ]),
    },
};

const setup = () => {
    const model = {
        upsertPolicy: vi.fn(async () => policy),
        findPolicy: vi.fn(async (): Promise<AiAccessPolicy | null> => policy),
    };
    const provider = {
        warehouseType: WarehouseTypes.SNOWFLAKE,
        configurationError: vi.fn((): string | null => null),
        missingPrerequisite: vi.fn(
            async (): Promise<AiAccessRefusalReason | null> => null,
        ),
        mint: vi.fn(
            async (): Promise<
                AiMintedCredentials<CreateWarehouseCredentials>
            > => ({
                credentials: snowflake,
                assurances: [{ kind: 'agent_session_active' }],
                expiresAt: null,
            }),
        ),
        probe: vi.fn(
            async (): Promise<AiSessionProbeResult> => ({
                ok: true,
                checkedAt: new Date(),
                observed: {},
            }),
        ),
    } satisfies AiCredentialProvider;
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const projects = {
        getSummary: vi.fn(async () => ({ organizationUuid: 'org' })),
        getWarehouseCredentialsForBinding: vi.fn(
            async (): Promise<CreateWarehouseCredentials> => connection,
        ),
    };
    const connections = {
        getProject: vi.fn(async () => ({ projectUuid: 'project' })),
        getCredentials: vi.fn(
            async (): Promise<CreateWarehouseCredentials> => connection,
        ),
    };
    const registry = vi.fn((): AiCredentialProvider => provider);
    const organizationSettings = {
        get: vi.fn(async () => ({ requireVerifiedAgentSessions: false })),
        upsert: vi.fn(
            async (
                _organizationUuid: string,
                settings: { requireVerifiedAgentSessions: boolean },
            ) => settings,
        ),
    };
    const service = new AiAccessService({
        organizationAgentIdentitySettingsModel:
            organizationSettings as unknown as OrganizationAgentIdentitySettingsModel,
        lightdashConfig: {} as LightdashConfig,
        aiAccessPolicyModel: model as unknown as AiAccessPolicyModel,
        featureFlagModel: flags as unknown as FeatureFlagModel,
        projectModel: projects as unknown as ProjectModel,
        warehouseConnectionModel:
            connections as unknown as WarehouseConnectionModel,
        userModel: {
            getUserDetailsByUuid: vi.fn(async () => ({
                email: 'a.b+tag@example.test',
            })),
        } as unknown as UserModel,
        providerRegistry: registry,
    });
    return {
        service,
        organizationSettings,
        model,
        provider,
        flags,
        registry,
        projects,
        connections,
    };
};

describe('AiAccessService', () => {
    describe('organization agent identity', () => {
        const snowflakeArgs = { ...args, connection: snowflake };

        test('refuses without an agent credential even without a connection policy', async () => {
            const { service, model, provider, organizationSettings, projects } =
                setup();
            model.findPolicy.mockResolvedValue(null);
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            provider.missingPrerequisite.mockResolvedValue(
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            expect(
                await service.getAiAccessForUser(snowflakeArgs),
            ).toMatchObject({
                requirementSource: 'organization',
                refusal: {
                    reason: 'needs_sign_in',
                    message:
                        'Connect your agent to the warehouse once so it can run as you.',
                },
            });
            await expect(
                service.resolvePlan(snowflakeArgs),
            ).rejects.toMatchObject({ refusal: { reason: 'needs_sign_in' } });
            expect(model.upsertPolicy).not.toHaveBeenCalled();
        });

        test('verifies a person plan with a credential without persisting a connection rule', async () => {
            const { service, model, provider, organizationSettings } = setup();
            model.findPolicy.mockResolvedValue(null);
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            provider.mint.mockResolvedValue({
                credentials: snowflake,
                assurances: [{ kind: 'agent_session_active' }],
                expiresAt: null,
            });
            expect(await service.resolvePlan(snowflakeArgs)).toMatchObject({
                identity: 'connected_person',
                transport: AI_DIRECT_TRANSPORT,
                assurances: [{ kind: 'agent_session_active' }],
            });
            expect(provider.probe).toHaveBeenCalledOnce();
            expect(model.upsertPolicy).not.toHaveBeenCalled();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: false,
            });
            expect(await service.resolvePlan(snowflakeArgs)).toMatchObject({
                identity: 'marked_person',
            });
        });

        test.each([
            [true, false, 'organization'],
            [true, true, 'organization'],
            [false, true, 'connection'],
            [false, false, null],
        ] as const)(
            'reports the source with org=%s and connection=%s',
            async (orgEnabled, connectionEnabled, requirementSource) => {
                const {
                    service,
                    model,
                    organizationSettings,
                    projects,
                    connections,
                } = setup();
                organizationSettings.get.mockResolvedValue({
                    requireVerifiedAgentSessions: orgEnabled,
                });
                model.findPolicy.mockResolvedValue(
                    connectionEnabled
                        ? { ...policy, principalKind: AiPrincipalKind.PERSON }
                        : null,
                );
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    snowflake,
                );
                connections.getCredentials.mockResolvedValue(snowflake);
                expect(
                    await service.getAiAccessForUser(snowflakeArgs),
                ).toMatchObject({ requirementSource });
                if (!orgEnabled && !connectionEnabled) {
                    expect(
                        await service.resolvePlan(snowflakeArgs),
                    ).toMatchObject({ identity: 'marked_person' });
                }
            },
        );

        test('ignores the organization setting for other warehouses', async () => {
            const { service, model, organizationSettings } = setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            model.findPolicy.mockResolvedValue(null);
            expect(await service.resolvePlan(args)).toMatchObject({
                identity: 'marked_person',
            });
            expect(await service.getAiAccessForUser(args)).toMatchObject({
                requirementSource: null,
            });
            expect(organizationSettings.get).not.toHaveBeenCalled();
        });

        test('keeps the feature flag gate', async () => {
            const { service, flags, organizationSettings } = setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            flags.get.mockResolvedValue({ enabled: false });
            expect(await service.resolvePlan(snowflakeArgs)).toBeNull();
            expect(
                await service.getAiAccessForUser(snowflakeArgs),
            ).toMatchObject({ enabled: false, requirementSource: null });
        });
    });

    test('marks a person policy without minting credentials or isolating results', async () => {
        const { service, model, provider } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.PERSON,
        });
        const plan = await service.resolvePlan(args);
        expect(plan).toMatchObject({
            identity: 'marked_person',
            transport: AI_DIRECT_TRANSPORT,
            audit: {
                personUuid: args.userUuid,
                principalRef: 'a.b+tag@example.test',
                queryTags: { agent: 'true' },
            },
        });
        expect(plan).not.toHaveProperty('credentials');
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            principalKind: AiPrincipalKind.PERSON,
            refusal: null,
        });
    });
    test('keeps external callers separate from registered users', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue(null);
        const plan = await service.resolvePlan({
            ...args,
            isRegisteredUser: false,
            userUuid: 'external-person',
        });
        expect(plan).toMatchObject({
            identity: 'marked_person',
            audit: { personUuid: 'external-person', userUuid: null },
        });
    });
    test('reports marked identity without a policy', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue(null);
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            refusal: null,
        });
    });
    test('restricts marker probes to project managers', async () => {
        const { service } = setup();
        const runQuery = vi.fn();
        await expect(
            service.testMarker(viewer, 'project', null, runQuery),
        ).rejects.toThrow(ForbiddenError);
        expect(runQuery).not.toHaveBeenCalled();
    });
    describe.each([WarehouseTypes.POSTGRES, WarehouseTypes.REDSHIFT] as const)(
        '%s identification marker',
        (type) => {
            test.each([
                ['true', 'lightdash-ai', true],
                [null, 'lightdash-ai', false],
                ['true', 'normal', false],
                [null, 'normal', false],
            ] as const)(
                'checks marker %s and application name %s',
                async (agent, applicationName, ok) => {
                    const { service, projects } = setup();
                    projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                        {
                            type,
                            host: 'localhost',
                            port: 5432,
                            user: 'connection',
                            password: 'test',
                            dbname: 'test',
                            schema: 'public',
                        },
                    );
                    const runQuery = vi.fn(async () => [
                        { agent, application_name: applicationName },
                    ]);
                    expect(
                        await service.testMarker(
                            account,
                            'project',
                            null,
                            runQuery,
                        ),
                    ).toMatchObject({
                        ok,
                        level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                        observed: { agent, application_name: applicationName },
                        message: ok
                            ? 'The query succeeded with agent tags sent through the listed channels. These tags identify queries; they do not enforce access.'
                            : 'The warehouse session did not report the expected agent marker.',
                    });
                    expect(runQuery).toHaveBeenCalledWith(
                        expect.stringContaining(
                            `current_setting('lightdash.agent', ${type === WarehouseTypes.POSTGRES})`,
                        ),
                    );
                },
            );
        },
    );
    test.each([true, false])(
        'reports request-bound channels when the Trino probe succeeds (%s)',
        async (succeeds) => {
            const { service, projects } = setup();
            projects.getWarehouseCredentialsForBinding.mockResolvedValue({
                type: WarehouseTypes.TRINO,
                host: 'localhost',
                port: 8080,
                http_scheme: 'http',
                user: 'agent',
                password: '',
                dbname: 'catalog',
                schema: 'public',
            });
            const runQuery = vi.fn(async () => {
                if (!succeeds) throw new Error('query failed');
                return [{ result: 1 }];
            });

            const result = await service.testMarker(
                account,
                'project',
                null,
                runQuery,
            );

            expect(result.ok).toBe(succeeds);
            expect(runQuery).toHaveBeenCalledWith('SELECT 1');
            if (succeeds) {
                expect(result.observed.channels).toBe(
                    'Client tag, Extra credential, User-Agent, SQL comment',
                );
                expect(result.message).toBe(
                    'The query carried the agent marker through the listed channels. Enforcement needs your access control plugin or policy to read it.',
                );
            }
        },
    );
    test('returns a failed marker result when the query fails', async () => {
        const { service } = setup();
        expect(
            await service.testMarker(account, 'project', null, async () => {
                throw new Error('secret');
            }),
        ).toMatchObject({ ok: false, observed: {} });
    });
    test('denies policy changes to project developers', async () => {
        const { service, model } = setup();
        const developer = {
            ...viewer,
            user: {
                ...viewer.user,
                ability: new Ability<PossibleAbilities>([
                    { action: 'update', subject: 'Project' },
                ]),
            },
        };
        await expect(
            service.upsertPolicy(developer, 'project', null, policy),
        ).rejects.toThrow(ForbiddenError);
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test('refuses embedded viewers distinctly from service accounts', async () => {
        const { service } = setup();
        await expect(
            service.resolvePlan({
                ...args,
                connection: snowflake,
                isRegisteredUser: false,
            }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                message:
                    'AI access runs as a signed-in person. Embedded viewers cannot use it on this connection.',
            },
        });
    });
    test('gets access for the calling user with view permission', async () => {
        const { service } = setup();
        const getAccess = vi.spyOn(service, 'getAiAccessForUser');
        await service.getMyAccess(viewer, 'project', null);
        expect(getAccess).toHaveBeenCalledWith({
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            connection,
            organizationUuid: 'org',
            userUuid: viewer.user.id,
            isRegisteredUser: true,
            isServiceAccount: false,
        });
    });
    test('loads extra connection credentials in the project scope', async () => {
        const { service, connections, projects } = setup();
        const capabilities = await service.getCapabilities(
            account,
            'project',
            'extra',
        );
        expect(capabilities.marker).toEqual(aiAgentMarkerMock);
        expect(connections.getProject).toHaveBeenCalledWith('project');
        expect(connections.getCredentials).toHaveBeenCalledWith(
            { projectUuid: 'project' },
            'extra',
        );
        expect(
            projects.getWarehouseCredentialsForBinding,
        ).not.toHaveBeenCalled();
    });
    test('reports a missing agent connection without minting', async () => {
        const { service, provider } = setup();
        provider.missingPrerequisite.mockResolvedValue(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        expect(
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            }),
        ).toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                action: 'sign_in',
                message:
                    'Connect your agent to the warehouse once so it can run as you.',
                settingsUrl: null,
            },
        });
        expect(provider.missingPrerequisite).toHaveBeenCalledWith(
            expect.objectContaining({
                person: { userUuid: 'user', email: 'a.b+tag@example.test' },
            }),
        );
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test.each([null, '/generalSettings/projectManagement/project/aiAccess'])(
        'links an admin refusal to organization warehouse credentials from %s',
        async (settingsUrl) => {
            const { service, provider } = setup();
            provider.missingPrerequisite.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NO_POLICY, {
                    settingsUrl,
                }),
            );
            expect(
                await service.getAiAccessForUser({
                    ...args,
                    connection: snowflake,
                }),
            ).toMatchObject({
                refusal: {
                    action: 'ask_admin',
                    settingsUrl: '/generalSettings/warehouseCredentials',
                },
            });
        },
    );
    test('does not check prerequisites separately when resolving a plan', async () => {
        const { service, provider } = setup();
        await service.resolvePlan(args);
        expect(provider.missingPrerequisite).not.toHaveBeenCalled();
    });
    test('registers Snowflake', () => {
        const registry = createAiCredentialProviderRegistry({
            lightdashConfig: lightdashConfigMock,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        });
        expect(registry(WarehouseTypes.SNOWFLAKE)).toBeInstanceOf(
            SnowflakeAiCredentialProvider,
        );
    });
    test.each([
        {
            plan: markedPersonPlanMock,
            userUuid: 'person-uuid',
            principalKind: AiPrincipalKind.PERSON,
            principalRef: 'person@example.test',
        },
        {
            plan: aiExecutionPlanMock,
            userUuid: 'person-uuid',
            principalKind: AiPrincipalKind.PERSON,
            principalRef: 'ai_shared',
        },
        {
            plan: {
                ...markedPersonPlanMock,
                audit: { ...markedPersonPlanMock.audit, userUuid: null },
            },
            userUuid: null,
            principalKind: AiPrincipalKind.PERSON,
            principalRef: 'person@example.test',
        },
    ])(
        'logs an agent query for $plan.identity with user $userUuid',
        ({ plan, userUuid, principalKind, principalRef }) => {
            const { service } = setup();
            const logger = Logger.child({});
            const info = vi
                .spyOn(logger, 'info')
                .mockImplementation(() => logger);
            Object.assign(service, { logger });
            service.recordQuery({
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                plan,
                context: QueryExecutionContext.AI,
            });
            expect(info).toHaveBeenCalledExactlyOnceWith('Agent query', {
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                userUuid,
                identity: plan.identity,
                principalKind,
                principalRef,
                transport: plan.transport,
                context: QueryExecutionContext.AI,
            });
        },
    );
    test('ignores non-AI contexts before checking flags', async () => {
        const { service, flags } = setup();
        expect(
            await service.resolvePlan({
                ...args,
                context: QueryExecutionContext.SQL_RUNNER,
            }),
        ).toBeNull();
        expect(flags.get).not.toHaveBeenCalled();
    });
    test('ignores a disabled flag', async () => {
        const { service, model, flags } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.resolvePlan(args)).toBeNull();
        expect(model.findPolicy).not.toHaveBeenCalled();
    });
    test.each([null, { ...policy, enabled: false }])(
        'defaults to marked person without an enabled policy: %s',
        async (value) => {
            const { service, model, provider } = setup();
            model.findPolicy.mockResolvedValue(value);
            expect(await service.resolvePlan(args)).toMatchObject({
                identity: 'marked_person',
                audit: { queryTags: { agent: 'true' } },
            });
            expect(provider.mint).not.toHaveBeenCalled();
        },
    );

    test('uses a virtual identity for a legacy connection policy and verifies every execution', async () => {
        const { service, model, provider } = setup();
        const first = await service.resolvePlan({
            ...args,
            connection: snowflake,
        });
        const second = await service.resolvePlan({
            ...args,
            connection: snowflake,
        });
        expect(first).toMatchObject({
            identity: 'connected_person',
            identityUuid: expect.any(String),
        });
        expect(second).toEqual(first);
        expect(first).not.toHaveProperty('principal');
        expect(provider.mint).toHaveBeenCalledTimes(2);
        expect(provider.probe).toHaveBeenCalledTimes(2);
        expect(model.upsertPolicy).not.toHaveBeenCalled();
        const other = await service.resolvePlan({
            ...args,
            connection: snowflake,
            userUuid: 'other',
        });
        expect(other).not.toEqual(first);
    });
    test('refuses an unverified Snowflake session with the admin action', async () => {
        const { service, provider } = setup();
        provider.probe.mockResolvedValue({
            ok: false,
            transient: false,
            checkedAt: new Date(),
            observed: {},
            reason: AiSessionFailureReason.NOT_AGENT_SESSION,
            message: 'Inactive session',
        });
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).rejects.toMatchObject({
            refusal: {
                reason: 'principal_failed',
                action: 'ask_admin',
                settingsUrl: '/generalSettings/warehouseCredentials',
            },
        });
    });
    test('saves the person policy without principal reconciliation', async () => {
        const { service, model } = setup();
        expect(
            await service.upsertPolicy(account, 'project', null, policy),
        ).toEqual(policy);
        expect(model.upsertPolicy).toHaveBeenCalledWith(
            'project',
            null,
            policy,
        );
    });
    test('does not register separate-principal providers', () => {
        const registry = createAiCredentialProviderRegistry({
            lightdashConfig: lightdashConfigMock,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        });
        for (const type of Object.values(WarehouseTypes).filter(
            (value) => value !== WarehouseTypes.SNOWFLAKE,
        ))
            expect(registry(type)).toBeNull();
    });
});
