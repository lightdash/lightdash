import { Ability } from '@casl/ability';
import {
    AI_DIRECT_TRANSPORT,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiProcedureRights,
    AiSetupScriptFormat,
    AiTransportKind,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    WarehouseTypes,
    type AiAccessPolicy,
    type AiPrincipal,
    type AiPrincipalWithSecrets,
    type AiProbeResult,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiPrincipalModel } from '../../models/AiPrincipalModel/AiPrincipalModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { AiAccessService, type ResolvePlanArgs } from './AiAccessService';
import { aiAgentMarkerMock, aiExecutionPlanMock } from './AiAccessService.mock';
import {
    type AiCreatedSecret,
    type AiCredentialProvider,
    type AiMintedCredentials,
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
    principalKind: AiPrincipalKind.SHARED,
    transport: AI_DIRECT_TRANSPORT,
    sharedRef: 'ai_shared',
    twinNameTemplate: 'ai_{email_local_part}_{user_uuid}',
    groupMappings: [],
    policySource: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const principal: AiPrincipalWithSecrets = {
    aiPrincipalUuid: 'principal',
    aiAccessPolicyUuid: 'policy',
    kind: AiPrincipalKind.SHARED,
    ref: 'ai_shared',
    userUuid: null,
    groupUuid: null,
    status: AiPrincipalStatus.PENDING,
    failureReason: null,
    statusMessage: null,
    lastProbe: null,
    publicKey: null,
    publicKeyFingerprint: null,
    secret: null,
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
        getPolicy: vi.fn(async () => policy),
        upsertPolicy: vi.fn(async () => policy),
        listPrincipals: vi.fn(async (): Promise<AiPrincipal[]> => []),
        resetStatus: vi.fn(async () => principal),
        deletePrincipal: vi.fn(async () => {}),
        insertAudit: vi.fn(async () => {}),
        findPolicy: vi.fn(async (): Promise<AiAccessPolicy | null> => policy),
        findPrincipalByRef: vi.fn(
            async (): Promise<AiPrincipalWithSecrets | null> => principal,
        ),
        findPrincipalForUser: vi.fn(
            async (): Promise<AiPrincipalWithSecrets | null> => principal,
        ),
        createPrincipal: vi.fn(
            async (
                _entry: Parameters<AiPrincipalModel['createPrincipal']>[0],
            ) => principal,
        ),
        getPrincipal: vi.fn(async (_id: string) => principal),
        setSecret: vi.fn(async () => {}),
        recordProbe: vi.fn(async (_id: string, probe: AiProbeResult) => ({
            ...principal,
            status: probe.ok
                ? AiPrincipalStatus.READY
                : AiPrincipalStatus.FAILED,
            lastProbe: probe,
        })),
    };
    const provider = {
        warehouseType: WarehouseTypes.POSTGRES,
        capabilities: vi.fn(
            (): Omit<AiWarehouseCapabilities, 'marker'> => ({
                warehouseType: WarehouseTypes.POSTGRES,
                principals: {
                    person: {
                        available: true as const,
                        method: AiCredentialMethod.KEY,
                    },
                    twin: {
                        available: true as const,
                        method: AiCredentialMethod.KEY,
                    },
                    group: {
                        available: true as const,
                        method: AiCredentialMethod.KEY,
                    },
                    shared: {
                        available: true as const,
                        method: AiCredentialMethod.KEY,
                    },
                },
                transports: {
                    direct: { available: true as const },
                    procedure: { available: true as const },
                },
                setupFormat: AiSetupScriptFormat.SQL,
            }),
        ),
        createSecret: vi.fn(async (): Promise<AiCreatedSecret | null> => null),
        missingPrerequisite: vi.fn(
            async (): Promise<AiAccessRefusalReason | null> => null,
        ),
        mint: vi.fn(
            async (): Promise<
                AiMintedCredentials<CreateWarehouseCredentials>
            > => ({
                credentials: { ...connection, user: 'ai' },
                assurances: [],
                expiresAt: null,
            }),
        ),
        probe: vi.fn(
            async (): Promise<AiProbeResult> => ({
                ok: true,
                checkedAt: new Date(),
                observed: {},
            }),
        ),
        setupScript: vi.fn(),
    } satisfies AiCredentialProvider;
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const groups = {
        getGroup: vi.fn(async () => ({ organizationUuid: 'org' })),
        findUserGroups: vi.fn(
            async (): Promise<{ uuid: string; name: string }[]> => [],
        ),
    };
    const projects = {
        getSummary: vi.fn(async () => ({ organizationUuid: 'org' })),
        getWarehouseCredentialsForProject: vi.fn(
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
    const service = new AiAccessService({
        lightdashConfig: {} as LightdashConfig,
        aiPrincipalModel: model as unknown as AiPrincipalModel,
        groupsModel: groups as unknown as GroupsModel,
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
        model,
        provider,
        flags,
        groups,
        registry,
        projects,
        connections,
    };
};

describe('AiAccessService', () => {
    test('marks a person policy without minting credentials or isolating results', async () => {
        const { service, model, provider } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.PERSON,
        });
        const capabilities = provider.capabilities();
        provider.capabilities.mockReturnValue({
            ...capabilities,
            principals: {
                ...capabilities.principals,
                person: { available: true, method: AiCredentialMethod.MARKER },
            },
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
        expect(await service.isPolicyEnabled(args)).toBe(false);
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            principalKind: AiPrincipalKind.PERSON,
            principal: null,
            refusal: null,
        });
        if (!plan) throw new Error('Expected a marked plan');
        await service.recordQuery({
            queryUuid: 'query',
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: null,
            plan,
        });
        expect(model.insertAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                aiPrincipalUuid: null,
                principalKind: AiPrincipalKind.PERSON,
                principalRef: 'a.b+tag@example.test',
                probeOk: true,
                personTag: args.userUuid,
            }),
        );
    });
    test('keeps external caller tags out of the audit user foreign key', async () => {
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
        if (!plan) throw new Error('Expected a marked plan');
        await service.recordQuery({
            queryUuid: 'query',
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: null,
            plan,
        });
        expect(model.insertAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                userUuid: null,
                personTag: 'external-person',
            }),
        );
    });
    test('reports marked identity without a policy', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue(null);
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            principal: null,
            refusal: null,
        });
        expect(await service.isPolicyEnabled(args)).toBe(false);
    });
    test('restricts marker probes to project managers', async () => {
        const { service } = setup();
        const runQuery = vi.fn();
        await expect(
            service.testMarker(viewer, 'project', null, runQuery),
        ).rejects.toThrow(ForbiddenError);
        expect(runQuery).not.toHaveBeenCalled();
    });
    test.each([
        ['true', 'lightdash-ai', true],
        [null, 'normal', false],
    ] as const)(
        'checks the session marker and application name',
        async (agent, applicationName, ok) => {
            const { service } = setup();
            const runQuery = vi.fn(async () => [
                { agent, application_name: applicationName },
            ]);
            expect(
                await service.testMarker(account, 'project', null, runQuery),
            ).toMatchObject({
                ok,
                observed: { agent, application_name: applicationName },
            });
            expect(runQuery).toHaveBeenCalledWith(
                expect.stringContaining(
                    "current_setting('lightdash.agent', true)",
                ),
            );
        },
    );
    test.each([true, false])(
        'reports request-bound channels when the Trino probe succeeds (%s)',
        async (succeeds) => {
            const { service, projects } = setup();
            projects.getWarehouseCredentialsForProject.mockResolvedValue({
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
            service.resolvePlan({ ...args, isRegisteredUser: false }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                message:
                    'AI access runs as a signed-in person. Embedded viewers cannot use it on this connection.',
            },
        });
    });
    test('shares concurrent mints and reuses unexpired credentials', async () => {
        const { service, provider } = setup();
        provider.mint.mockResolvedValue({
            credentials: connection,
            assurances: [],
            expiresAt: new Date(Date.now() + 480000),
        });
        await Promise.all([
            service.resolvePlan(args),
            service.resolvePlan(args),
        ]);
        await service.resolvePlan(args);
        expect(provider.mint).toHaveBeenCalledTimes(1);
    });
    test('shares a mint while the provider is still waiting', async () => {
        const { service, provider } = setup();
        let complete:
            | ((value: AiMintedCredentials<CreateWarehouseCredentials>) => void)
            | null = null;
        const pending = new Promise<
            AiMintedCredentials<CreateWarehouseCredentials>
        >((resolve) => {
            complete = resolve;
        });
        provider.mint.mockReturnValue(pending);
        const first = service.resolvePlan(args);
        const second = service.resolvePlan(args);
        await vi.waitFor(() => expect(provider.mint).toHaveBeenCalledTimes(1));
        if (complete === null) throw new Error('Missing mint resolver');
        (
            complete as (
                value: AiMintedCredentials<CreateWarehouseCredentials>,
            ) => void
        )({
            credentials: connection,
            assurances: [],
            expiresAt: new Date(Date.now() + 480000),
        });
        await Promise.all([first, second]);
        expect(provider.mint).toHaveBeenCalledTimes(1);
    });
    test('drops a failed mint so the next query can retry', async () => {
        const { service, provider } = setup();
        provider.mint.mockRejectedValueOnce(new Error('mint unavailable'));
        await expect(service.resolvePlan(args)).rejects.toThrow(
            'mint unavailable',
        );
        await service.resolvePlan(args);
        expect(provider.mint).toHaveBeenCalledTimes(2);
    });
    test('reprobes a recent transient failure before executing again', async () => {
        const { service, provider, model } = setup();
        model.findPrincipalByRef.mockResolvedValue({
            ...principal,
            status: AiPrincipalStatus.READY,
            lastProbe: {
                ok: false,
                transient: true,
                checkedAt: new Date(),
                reason: AiPrincipalFailureReason.UNKNOWN,
                message: 'Temporary failure',
                observed: {},
            },
        });
        await service.resolvePlan(args);
        expect(provider.probe).toHaveBeenCalledOnce();
    });
    test('mints again after expiry', async () => {
        const { service, provider } = setup();
        provider.mint.mockResolvedValue({
            credentials: connection,
            assurances: [],
            expiresAt: new Date(0),
        });
        await service.resolvePlan(args);
        await service.resolvePlan(args);
        expect(provider.mint).toHaveBeenCalledTimes(2);
    });
    test('does not cache credentials without an expiry', async () => {
        const { service, provider } = setup();
        await service.resolvePlan(args);
        await service.resolvePlan(args);
        expect(provider.mint).toHaveBeenCalledTimes(2);
    });
    test('records a transient failure, refuses generically, and clears the mint cache', async () => {
        const { service, provider, model } = setup();
        provider.mint.mockResolvedValue({
            credentials: connection,
            assurances: [],
            expiresAt: new Date(Date.now() + 480000),
        });
        provider.probe.mockResolvedValueOnce({
            ok: false,
            transient: true,
            checkedAt: new Date(),
            observed: {},
            reason: AiPrincipalFailureReason.UNKNOWN,
            message: 'private host connection failed',
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                message:
                    'The last check of your AI principal failed. Ask an admin to review it.',
            },
        });
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ transient: true }),
        );
        await service.resolvePlan(args);
        expect(provider.mint).toHaveBeenCalledTimes(2);
    });
    test.each(['deletePrincipal', 'regenerateSecret'] as const)(
        '%s clears cached credentials',
        async (method) => {
            const { service, provider } = setup();
            provider.mint.mockResolvedValue({
                credentials: connection,
                assurances: [],
                expiresAt: new Date(Date.now() + 480000),
            });
            await service.resolvePlan(args);
            provider.createSecret.mockResolvedValue({
                secret: 'new',
                publicKey: null,
                publicKeyFingerprint: null,
            });
            await service[method](account, 'principal');
            await service.resolvePlan(args);
            expect(provider.mint).toHaveBeenCalledTimes(2);
        },
    );

    test('denies policy writes and principal reads to non-admins', async () => {
        const { service, model, projects } = setup();
        await expect(
            service.upsertPolicy(viewer, 'project', null, policy),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.listPrincipals(viewer, 'project', null),
        ).rejects.toThrow(ForbiddenError);
        expect(model.upsertPolicy).not.toHaveBeenCalled();
        expect(model.listPrincipals).not.toHaveBeenCalled();
        expect(
            projects.getWarehouseCredentialsForProject,
        ).not.toHaveBeenCalled();
    });
    test('rejects an unavailable kind with the provider reason', async () => {
        const { service, model, provider } = setup();
        const capabilities = provider.capabilities();
        capabilities.principals.shared = {
            available: false,
            reason: 'Unavailable kind',
        };
        provider.capabilities.mockReturnValue(capabilities);
        await expect(
            service.upsertPolicy(account, 'project', null, policy),
        ).rejects.toThrow('Unavailable kind');
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test('rejects an unavailable transport', async () => {
        const { service, model, provider } = setup();
        const capabilities = provider.capabilities();
        capabilities.transports.direct = {
            available: false,
            reason: 'Unavailable transport',
        };
        provider.capabilities.mockReturnValue(capabilities);
        await expect(
            service.upsertPolicy(account, 'project', null, policy),
        ).rejects.toThrow('Unavailable transport');
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test.each([null, '', '   '])(
        'rejects a shared policy with ref %s',
        async (sharedRef) => {
            const { service, model } = setup();
            await expect(
                service.upsertPolicy(account, 'project', null, {
                    ...policy,
                    sharedRef,
                }),
            ).rejects.toThrow(ParameterError);
            expect(model.upsertPolicy).not.toHaveBeenCalled();
        },
    );
    test('rejects foreign groups before writing', async () => {
        const { service, model, groups } = setup();
        groups.getGroup.mockResolvedValue({ organizationUuid: 'other' });
        await expect(
            service.upsertPolicy(account, 'project', null, {
                ...policy,
                principalKind: AiPrincipalKind.GROUP,
                groupMappings: [
                    {
                        groupUuid: '44444444-4444-4444-8444-444444444444',
                        ref: 'ai_group',
                        priority: 1,
                    },
                ],
            }),
        ).rejects.toThrow(ParameterError);
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test('rejects a group mapping without a valid group uuid', async () => {
        const { service, model, groups } = setup();
        await expect(
            service.upsertPolicy(account, 'project', null, {
                ...policy,
                principalKind: AiPrincipalKind.GROUP,
                groupMappings: [
                    { groupUuid: '', ref: 'ai_group', priority: 1 },
                ],
            }),
        ).rejects.toThrow('A group mapping needs a group.');
        expect(groups.getGroup).not.toHaveBeenCalled();
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test('rejects duplicate group refs before writing', async () => {
        const { service, model } = setup();
        await expect(
            service.upsertPolicy(account, 'project', null, {
                ...policy,
                principalKind: AiPrincipalKind.GROUP,
                groupMappings: [
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                ].map((groupUuid) => ({
                    groupUuid,
                    ref: 'same',
                    priority: 1,
                })),
            }),
        ).rejects.toThrow('Group principal references must be unique.');
        expect(model.upsertPolicy).not.toHaveBeenCalled();
    });
    test('creates a principal and secret for each group mapping', async () => {
        const { service, model, provider } = setup();
        const groupPolicy = {
            ...policy,
            principalKind: AiPrincipalKind.GROUP,
            groupMappings: [
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
            ].map((groupUuid) => ({
                groupUuid,
                groupName: groupUuid,
                ref: `ai_${groupUuid}`,
                priority: 1,
            })),
        };
        model.upsertPolicy.mockResolvedValue(groupPolicy);
        model.createPrincipal.mockImplementation(async (entry) => ({
            ...principal,
            ...entry,
            aiPrincipalUuid: entry.ref,
        }));
        model.getPrincipal.mockImplementation(async (id) => ({
            ...principal,
            aiPrincipalUuid: id,
        }));
        const secret = {
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(secret);
        await service.upsertPolicy(account, 'project', null, groupPolicy);
        expect(model.createPrincipal).toHaveBeenCalledTimes(2);
        for (const groupUuid of [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
        ]) {
            expect(model.createPrincipal).toHaveBeenCalledWith({
                aiAccessPolicyUuid: 'policy',
                kind: AiPrincipalKind.GROUP,
                ref: `ai_${groupUuid}`,
                groupUuid,
                userUuid: null,
            });
            expect(model.setSecret).toHaveBeenCalledWith(
                `ai_${groupUuid}`,
                secret,
            );
        }
        expect(provider.createSecret).toHaveBeenCalledTimes(2);
    });
    test('retires principals that no longer match the saved policy', async () => {
        const { service, model, provider } = setup();
        const sharedPolicy = {
            ...policy,
            principalKind: AiPrincipalKind.SHARED,
            sharedRef: 'ai_shared',
            groupMappings: [],
        };
        model.upsertPolicy.mockResolvedValue(sharedPolicy);
        model.listPrincipals.mockResolvedValue([
            {
                ...principal,
                aiPrincipalUuid: 'stale-group',
                kind: AiPrincipalKind.GROUP,
                ref: 'ai_group',
                groupUuid: '11111111-1111-4111-8111-111111111111',
            },
            {
                ...principal,
                aiPrincipalUuid: 'kept-shared',
                kind: AiPrincipalKind.SHARED,
                ref: 'ai_shared',
                groupUuid: null,
            },
        ]);
        model.createPrincipal.mockImplementation(async (entry) => ({
            ...principal,
            ...entry,
            aiPrincipalUuid: entry.ref,
        }));
        model.getPrincipal.mockImplementation(async (id) => ({
            ...principal,
            aiPrincipalUuid: id,
        }));
        provider.createSecret.mockResolvedValue({
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        });
        await service.upsertPolicy(account, 'project', null, sharedPolicy);
        expect(model.deletePrincipal).toHaveBeenCalledWith('stale-group');
        expect(model.deletePrincipal).not.toHaveBeenCalledWith('kept-shared');
        expect(model.createPrincipal).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: AiPrincipalKind.SHARED,
                ref: 'ai_shared',
            }),
        );
    });
    test('rejects a setup principal from another policy', async () => {
        const { service, model, provider } = setup();
        model.getPrincipal.mockResolvedValue({
            ...principal,
            aiAccessPolicyUuid: 'other',
        });
        await expect(
            service.getSetupScript(account, 'project', null, 'principal'),
        ).rejects.toThrow(NotFoundError);
        expect(provider.setupScript).not.toHaveBeenCalled();
        expect(provider.createSecret).not.toHaveBeenCalled();
    });
    test('passes a null principal for connection setup', async () => {
        const { service, provider } = setup();
        await service.getSetupScript(account, 'project', null, null);
        expect(provider.setupScript).toHaveBeenCalledWith({
            connection,
            policy,
            principal: null,
        });
    });
    test('records a ready principal after a good probe', async () => {
        const { service, model, provider } = setup();
        expect(await service.testPrincipal(account, 'principal')).toMatchObject(
            { status: AiPrincipalStatus.READY },
        );
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ ok: true }),
        );
        expect(provider.mint).toHaveBeenCalledWith(
            expect.objectContaining({
                person: {
                    userUuid: account.user.id,
                    email: 'a.b+tag@example.test',
                },
            }),
        );
    });
    test('records a failed probe when mint refuses credentials', async () => {
        const { service, model, provider } = setup();
        provider.mint.mockRejectedValue(
            new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN, {
                message: 'Sign in again',
            }),
        );
        expect(await service.testPrincipal(account, 'principal')).toMatchObject(
            { status: AiPrincipalStatus.FAILED },
        );
        expect(model.recordProbe).toHaveBeenCalledWith('principal', {
            ok: false,
            transient: false,
            checkedAt: expect.any(Date),
            observed: {},
            reason: AiPrincipalFailureReason.CREDENTIAL_REJECTED,
            message: 'Sign in again',
        });
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('refuses testing another person principal', async () => {
        const { service, model, provider } = setup();
        model.getPrincipal.mockResolvedValue({
            ...principal,
            userUuid: 'other',
        });
        await expect(
            service.testPrincipal(account, 'principal'),
        ).rejects.toThrow('Only the person can test their own AI principal.');
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test('regenerates the secret and resets status without probing', async () => {
        const { service, model, provider } = setup();
        const secret = {
            secret: 'new',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(secret);
        expect(
            await service.regenerateSecret(account, 'principal'),
        ).toMatchObject({ status: AiPrincipalStatus.PENDING });
        expect(model.setSecret).toHaveBeenCalledWith('principal', secret);
        expect(model.resetStatus).toHaveBeenCalledWith('principal');
        expect(model.recordProbe).not.toHaveBeenCalled();
    });
    test('rejects regeneration for minted credentials', async () => {
        const { service, model } = setup();
        await expect(
            service.regenerateSecret(account, 'principal'),
        ).rejects.toThrow(
            'This warehouse mints credentials; there is no secret to regenerate.',
        );
        expect(model.setSecret).not.toHaveBeenCalled();
        expect(model.resetStatus).not.toHaveBeenCalled();
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
            projects.getWarehouseCredentialsForProject,
        ).not.toHaveBeenCalled();
    });
    test('rejects a principal under another project route', async () => {
        const { service, model } = setup();
        model.getPolicy.mockResolvedValue({ ...policy, projectUuid: 'other' });
        await expect(
            service.assertPrincipalProject(account, 'project', 'principal'),
        ).rejects.toThrow(NotFoundError);
    });
    test('reports a missing sign-in without minting', async () => {
        const { service, provider } = setup();
        provider.missingPrerequisite.mockResolvedValue(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                action: 'sign_in',
            },
        });
        expect(provider.missingPrerequisite).toHaveBeenCalledWith(
            expect.objectContaining({
                person: { userUuid: 'user', email: 'a.b+tag@example.test' },
            }),
        );
        expect(provider.createSecret.mock.invocationCallOrder[0]).toBeLessThan(
            provider.missingPrerequisite.mock.invocationCallOrder[0],
        );
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
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
    test.each([aiExecutionPlanMock.principal.lastProbe, null])(
        'records the audit with probe %s',
        async (lastProbe) => {
            const { service, model } = setup();
            const plan = {
                ...aiExecutionPlanMock,
                principal: { ...aiExecutionPlanMock.principal, lastProbe },
            };
            await service.recordQuery({
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                plan,
            });
            expect(model.insertAudit).toHaveBeenCalledExactlyOnceWith({
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                userUuid: plan.audit.personUuid,
                aiPrincipalUuid: plan.principal.aiPrincipalUuid,
                principalKind: plan.principal.kind,
                principalRef: plan.principal.ref,
                transport: plan.transport,
                probeOk: lastProbe?.ok ?? false,
                probeCheckedAt: lastProbe?.checkedAt ?? null,
                personTag: plan.audit.personUuid,
            });
        },
    );
    test('propagates audit storage failures', async () => {
        const { service, model } = setup();
        const error = new Error('audit unavailable');
        model.insertAudit.mockRejectedValue(error);
        await expect(
            service.recordQuery({
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: null,
                plan: aiExecutionPlanMock,
            }),
        ).rejects.toBe(error);
    });
    test('creates and reloads a secret before minting', async () => {
        const { service, model, provider } = setup();
        const created = {
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(created);
        model.getPrincipal.mockResolvedValue({ ...principal, ...created });
        await service.resolvePlan(args);
        expect(model.setSecret).toHaveBeenCalledWith('principal', created);
        expect(model.getPrincipal).toHaveBeenCalledWith('principal');
        expect(provider.mint).toHaveBeenCalledWith(
            expect.objectContaining({
                principal: expect.objectContaining({ secret: 'generated' }),
            }),
        );
        expect(provider.createSecret.mock.invocationCallOrder[0]).toBeLessThan(
            model.setSecret.mock.invocationCallOrder[0],
        );
        expect(model.setSecret.mock.invocationCallOrder[0]).toBeLessThan(
            model.getPrincipal.mock.invocationCallOrder[0],
        );
        expect(model.getPrincipal.mock.invocationCallOrder[0]).toBeLessThan(
            provider.mint.mock.invocationCallOrder[0],
        );
    });
    test('does not save a secret for a broker', async () => {
        const { service, model, provider } = setup();
        await service.resolvePlan(args);
        expect(provider.createSecret).toHaveBeenCalledOnce();
        expect(model.setSecret).not.toHaveBeenCalled();
    });
    test('creates a secret for setup without minting or probing', async () => {
        const { service, model, provider } = setup();
        const created = {
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(created);
        model.getPrincipal.mockResolvedValue({ ...principal, ...created });
        const result = await service.getAiAccessForUser(args);
        expect(model.setSecret).toHaveBeenCalledWith('principal', created);
        expect(model.getPrincipal).toHaveBeenCalledWith('principal');
        expect(result.principal).not.toHaveProperty('secret');
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('keeps an existing secret', async () => {
        const { service, model, provider } = setup();
        model.findPrincipalByRef.mockResolvedValue({
            ...principal,
            secret: 'existing',
        });
        await service.resolvePlan(args);
        expect(provider.createSecret).not.toHaveBeenCalled();
        expect(model.setSecret).not.toHaveBeenCalled();
    });
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
    test.each([{ isServiceAccount: true }, { isRegisteredUser: false }])(
        'refuses non-person callers: %s',
        async (caller) => {
            const { service, provider } = setup();
            await expect(
                service.resolvePlan({ ...args, ...caller }),
            ).rejects.toMatchObject({
                refusal: {
                    reason: caller.isServiceAccount
                        ? AiAccessRefusalReason.SERVICE_ACCOUNT
                        : AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                },
            });
            expect(provider.mint).not.toHaveBeenCalled();
        },
    );
    test('selects the highest group priority and uses names to break ties', async () => {
        const { service, model, groups } = setup();
        groups.findUserGroups.mockResolvedValue([
            { uuid: '11111111-1111-4111-8111-111111111111', name: 'Alpha' },
            { uuid: '22222222-2222-4222-8222-222222222222', name: 'Beta' },
            { uuid: '33333333-3333-4333-8333-333333333333', name: 'Charlie' },
        ]);
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.GROUP,
            groupMappings: [
                {
                    groupUuid: '33333333-3333-4333-8333-333333333333',
                    groupName: 'Charlie',
                    ref: 'low',
                    priority: 1,
                },
                {
                    groupUuid: '22222222-2222-4222-8222-222222222222',
                    groupName: 'Beta',
                    ref: 'beta',
                    priority: 2,
                },
                {
                    groupUuid: '11111111-1111-4111-8111-111111111111',
                    groupName: 'Alpha',
                    ref: 'alpha',
                    priority: 2,
                },
            ],
        });
        await service.resolvePlan(args);
        expect(model.findPrincipalByRef).toHaveBeenCalledWith({
            aiAccessPolicyUuid: 'policy',
            ref: 'alpha',
        });
    });
    test('refuses when no group mapping matches', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.GROUP,
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.NO_GROUP_MAPPING },
        });
    });
    test('fills and sanitizes the twin name template', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.TWIN,
        });
        model.findPrincipalForUser.mockResolvedValue(null);
        model.findPrincipalByRef.mockResolvedValue(null);
        await service.resolvePlan(args);
        expect(model.createPrincipal).toHaveBeenCalledWith({
            aiAccessPolicyUuid: 'policy',
            kind: AiPrincipalKind.TWIN,
            ref: 'ai_a_b_tag_user',
            userUuid: 'user',
            groupUuid: null,
        });
    });
    test('probes a pending principal and returns it ready without secrets', async () => {
        const { service, model, provider } = setup();
        const plan = await service.resolvePlan(args);
        expect(provider.probe).toHaveBeenCalledOnce();
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ ok: true }),
        );
        if (plan?.identity !== 'principal')
            throw new Error('Expected a principal plan');
        expect(plan.principal.status).toBe(AiPrincipalStatus.READY);
        expect(plan?.principal).not.toHaveProperty('secret');
        expect(plan?.audit.queryTags).toEqual({ ai_principal: 'ai_shared' });
    });
    test('records a failed probe and refuses', async () => {
        const { service, model, provider } = setup();
        provider.probe.mockResolvedValue({
            ok: false,
            transient: false,
            checkedAt: new Date(),
            observed: {},
            reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
            message: 'Wrong principal',
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                message:
                    'The last check of your AI principal failed. Ask an admin to review it.',
            },
        });
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ ok: false }),
        );
        expect((await model.recordProbe.mock.results[0].value).status).toBe(
            AiPrincipalStatus.FAILED,
        );
    });
    test.each([0, 61 * 60 * 1000])(
        'reprobes ready principals only after an hour (%s)',
        async (age) => {
            const { service, model, provider } = setup();
            model.findPrincipalByRef.mockResolvedValue({
                ...principal,
                status: AiPrincipalStatus.READY,
                lastProbe: {
                    ok: true,
                    checkedAt: new Date(Date.now() - age),
                    observed: {},
                },
            });
            await service.resolvePlan(args);
            expect(provider.probe).toHaveBeenCalledTimes(age === 0 ? 0 : 1);
        },
    );
    test('refuses failed principals without minting', async () => {
        const { service, model, provider } = setup();
        model.findPrincipalByRef.mockResolvedValue({
            ...principal,
            status: AiPrincipalStatus.FAILED,
            statusMessage: 'Check failed',
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                message:
                    'The last check of your AI principal failed. Ask an admin to review it.',
            },
        });
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test('reports pending access without mint or probe', async () => {
        const { service, provider } = setup();
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            refusal: null,
            principal: { status: AiPrincipalStatus.PENDING },
        });
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('reports refusal shapes without mint or probe', async () => {
        const { service, provider } = setup();
        const result = await service.getAiAccessForUser({
            ...args,
            isServiceAccount: true,
        });
        expect(result.refusal).toEqual(
            new AiAccessRefusedError(AiAccessRefusalReason.SERVICE_ACCOUNT)
                .refusal,
        );
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('gates procedure transport separately', async () => {
        const { service, model, flags, provider } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            transport: {
                kind: AiTransportKind.PROCEDURE,
                name: 'ai_query',
                rights: AiProcedureRights.DEFINER,
            },
        });
        flags.get
            .mockResolvedValueOnce({ enabled: true })
            .mockResolvedValueOnce({ enabled: false });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.TRANSPORT_UNAVAILABLE },
        });
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test.each(
        Object.values(WarehouseTypes).filter(
            (type) =>
                type !== WarehouseTypes.POSTGRES &&
                type !== WarehouseTypes.SNOWFLAKE,
        ),
    )('registry refuses %s with its capability reason', async (type) => {
        const { service, registry } = setup();
        const unavailable = createAiCredentialProviderRegistry({
            lightdashConfig: lightdashConfigMock,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        })(type);
        registry.mockReturnValue(unavailable);
        const capabilities = unavailable.capabilities(connection);
        expect(capabilities.principals.person.available).toBe(
            type !== WarehouseTypes.DUCKDB,
        );
        expect(capabilities.transports.direct.available).toBe(
            type !== WarehouseTypes.DUCKDB,
        );
        expect(capabilities.principals.twin.available).toBe(false);
        expect(capabilities.principals.group.available).toBe(false);
        const capability = capabilities.principals.shared;
        if (capability.available)
            throw new Error('Expected unavailable provider');
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                message: capability.reason,
            },
        });
        await expect(
            unavailable.mint({
                connection,
                principal,
                policy,
                person: { userUuid: 'user', email: 'user@example.test' },
            }),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        await expect(unavailable.probe(connection, [])).rejects.toBeInstanceOf(
            AiAccessRefusedError,
        );
        expect(() =>
            unavailable.setupScript({ connection, principal, policy }),
        ).toThrow(AiAccessRefusedError);
    });
});
