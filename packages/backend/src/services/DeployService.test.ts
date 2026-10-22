import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AgentActorSurface,
    DeploySessionStatus,
    FeatureFlags,
    ProjectType,
    type MemberAbility,
    type RegisteredAccount,
} from '@lightdash/common';
import { toSessionUser } from '../auth/account';
import {
    getPeerDbtSourcesEnabled,
    hasPeerDbtSourcesOperation,
    withPeerDbtSourcesOperation,
} from '../utils/peerDbtSourcesOperation';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from './AiAccessService/agentExecutionContext';
import { DeployService } from './DeployService';

const projectSummary = {
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    slug: 'project',
    name: 'Project',
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: undefined,
    createdByUserUuid: null,
    provisioningSource: null,
};

const buildAccount = (ability: MemberAbility): RegisteredAccount =>
    ({
        authentication: {
            type: 'service-account',
            source: 'token',
            serviceAccountUuid: 'service-account-uuid',
            serviceAccountDescription: 'Deploy service account',
        },
        organization: {
            organizationUuid: 'org-uuid',
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'service-account-user-uuid',
            userUuid: 'service-account-user-uuid',
            userId: 1,
            email: undefined,
            firstName: 'Service',
            lastName: 'Account',
            role: 'member',
            type: 'registered',
            isActive: true,
            ability,
            abilityRules: ability.rules,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            timezone: null,
        },
        isAnonymousUser: () => false,
        isAuthenticated: () => true,
        isJwtUser: () => false,
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => true,
        isServiceAccount: () => true,
        isSessionUser: () => false,
    }) as RegisteredAccount;

const getFeatureFlagModel = () => ({
    get: vi.fn(async () => ({
        id: FeatureFlags.PeerDbtSources,
        enabled: false,
    })),
});

describe('DeployService', () => {
    it('allows starting a deploy session for an own preview from a granted upstream project', async () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('manage', 'DeployProject', {
            upstreamProjectUuid: 'upstream-project-uuid',
            createdByUserUuid: 'service-account-user-uuid',
            type: ProjectType.PREVIEW,
        });

        const service = new DeployService({
            featureFlagModel: getFeatureFlagModel(),
            deploySessionModel: {
                createSession: vi.fn().mockResolvedValue('deploy-session-uuid'),
            },
            projectModel: {
                requireSingleConnectionRoute: vi
                    .fn()
                    .mockResolvedValue('single'),
                getWithSensitiveFields: vi.fn().mockResolvedValue({
                    projectUuid: 'preview-project-uuid',
                    organizationUuid: 'org-uuid',
                    upstreamProjectUuid: 'upstream-project-uuid',
                    name: 'Preview',
                    type: ProjectType.PREVIEW,
                    createdByUserUuid: 'service-account-user-uuid',
                }),
            },
            projectService: {
                assertConnectionPreAggregateRefresh: vi.fn(),
                assertAgentConnectionEffect: vi.fn(),
            },
            schedulerClient: {},
        } as never);

        await expect(
            service.startDeploySession(
                buildAccount(builder.build()),
                'preview-project-uuid',
            ),
        ).resolves.toEqual({ deploySessionUuid: 'deploy-session-uuid' });
    });

    it.each([
        { complete: true, dbtModelNames: undefined },
        { complete: false, dbtModelNames: undefined },
        { complete: false, dbtModelNames: ['orders', 'customers'] },
        { complete: false, dbtModelNames: [] },
    ])(
        'passes batched completeness $complete and model inventory $dbtModelNames to the cache write',
        async ({ complete, dbtModelNames }) => {
            const projectService = {
                assertConnectionPreAggregateRefresh: vi.fn(),
                assertAgentConnectionEffect: vi.fn(),
                saveDeployExplores: vi.fn().mockResolvedValue('index-job-uuid'),
                trackCliSourceDeploy: vi.fn().mockResolvedValue(undefined),
                getDeployStartOfWeekByExplore: vi
                    .fn()
                    .mockResolvedValue(new Map()),
            };
            const deploySessionModel = {
                getSession: vi.fn().mockResolvedValue({
                    deploySessionUuid: 'deploy-session-uuid',
                    projectUuid: 'project-uuid',
                    userUuid: 'service-account-user-uuid',
                    status: DeploySessionStatus.UPLOADING,
                    batchCount: 1,
                    exploreCount: 0,
                    createdAt: new Date(),
                }),
                updateStatus: vi.fn().mockResolvedValue(undefined),
                getDeployData: vi.fn().mockResolvedValue({
                    explores: [],
                    complete,
                }),
                deleteSession: vi.fn().mockResolvedValue(undefined),
            };
            const schedulerClient = {
                generateValidation: vi.fn().mockResolvedValue(undefined),
            };
            const service = new DeployService({
                featureFlagModel: getFeatureFlagModel(),
                deploySessionModel,
                projectModel: {
                    requireSingleConnectionRoute: vi
                        .fn()
                        .mockResolvedValue('single'),
                    getSummary: vi.fn().mockResolvedValue(projectSummary),
                    getWithSensitiveFields: vi.fn().mockResolvedValue({
                        organizationUuid: 'org-uuid',
                        warehouseConnection: null,
                    }),
                },
                projectService,
                schedulerClient,
            } as never);
            const user = toSessionUser(
                buildAccount(
                    new Ability([
                        {
                            action: 'manage',
                            subject: 'DeployProject',
                            conditions: { projectUuid: 'project-uuid' },
                        },
                    ]),
                ),
            );

            await service.finalizeDeploy(
                user,
                'project-uuid',
                'deploy-session-uuid',
                undefined,
                dbtModelNames,
            );

            expect(projectService.saveDeployExplores).toHaveBeenCalledWith(
                expect.objectContaining({
                    complete,
                    dbtModelNames,
                    cliDeploy: { sourceUuid: null, target: null },
                }),
            );
        },
    );

    it('passes the dbt source and the dbt target of the CLI to the cache write', async () => {
        const saveDeployExplores = vi.fn().mockResolvedValue('index-job-uuid');
        const trackCliSourceDeploy = vi.fn().mockResolvedValue(undefined);
        const updateStatus = vi.fn().mockResolvedValue(undefined);
        const deleteSession = vi.fn().mockResolvedValue(undefined);
        const generateValidation = vi.fn().mockResolvedValue(undefined);
        const user = toSessionUser(
            buildAccount(
                new Ability([
                    {
                        action: 'manage',
                        subject: 'DeployProject',
                        conditions: { projectUuid: 'project-uuid' },
                    },
                ]),
            ),
        );
        const service = new DeployService({
            featureFlagModel: getFeatureFlagModel(),
            deploySessionModel: {
                getSession: vi.fn().mockResolvedValue({
                    deploySessionUuid: 'deploy-session-uuid',
                    projectUuid: 'project-uuid',
                    userUuid: user.userUuid,
                    status: DeploySessionStatus.UPLOADING,
                    batchCount: 1,
                    exploreCount: 0,
                    createdAt: new Date(),
                }),
                updateStatus,
                getDeployData: vi
                    .fn()
                    .mockResolvedValue({ explores: [], complete: true }),
                deleteSession,
            },
            projectModel: {
                getSummary: vi.fn().mockResolvedValue(projectSummary),
                getWithSensitiveFields: vi.fn().mockResolvedValue({
                    organizationUuid: 'org-uuid',
                    warehouseConnection: null,
                }),
            },
            projectService: {
                assertConnectionPreAggregateRefresh: vi.fn(),
                assertAgentConnectionEffect: vi.fn(),
                saveDeployExplores,
                trackCliSourceDeploy,
                getDeployStartOfWeekByExplore: vi
                    .fn()
                    .mockResolvedValue(new Map()),
            },
            schedulerClient: {
                generateValidation,
            },
        } as never);

        await service.finalizeDeploy(
            user,
            'project-uuid',
            'deploy-session-uuid',
            'cli-1',
            undefined,
            {
                sourceUuid: 'finance-source-uuid',
                target: { database: 'finance' },
            },
        );

        expect(saveDeployExplores).toHaveBeenCalledWith(
            expect.objectContaining({
                cliDeploy: {
                    sourceUuid: 'finance-source-uuid',
                    target: { database: 'finance' },
                },
            }),
        );
        expect(trackCliSourceDeploy).toHaveBeenCalledExactlyOnceWith(
            {
                userUuid: user.userUuid,
                projectUuid: 'project-uuid',
                cliDeploy: {
                    sourceUuid: 'finance-source-uuid',
                    target: { database: 'finance' },
                },
            },
            { status: 'success' },
        );
        expect(
            vi.mocked(generateValidation).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(trackCliSourceDeploy).mock.invocationCallOrder[0],
        );
        expect(updateStatus).toHaveBeenCalledWith(
            'deploy-session-uuid',
            DeploySessionStatus.COMPLETED,
        );
        expect(
            vi.mocked(deleteSession).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(trackCliSourceDeploy).mock.invocationCallOrder[0],
        );
    });

    it('tracks a failed selected source deploy when validation fails', async () => {
        const failure = new Error('validation unavailable');
        const trackCliSourceDeploy = vi.fn().mockResolvedValue(undefined);
        const updateStatus = vi.fn().mockResolvedValue(undefined);
        const user = toSessionUser(
            buildAccount(
                new Ability([
                    {
                        action: 'manage',
                        subject: 'DeployProject',
                        conditions: { projectUuid: 'project-uuid' },
                    },
                ]),
            ),
        );
        const service = new DeployService({
            featureFlagModel: getFeatureFlagModel(),
            deploySessionModel: {
                getSession: vi.fn().mockResolvedValue({
                    deploySessionUuid: 'deploy-session-uuid',
                    projectUuid: 'project-uuid',
                    userUuid: user.userUuid,
                    status: DeploySessionStatus.UPLOADING,
                    batchCount: 1,
                    exploreCount: 0,
                    createdAt: new Date(),
                }),
                updateStatus,
                getDeployData: vi
                    .fn()
                    .mockResolvedValue({ explores: [], complete: true }),
                deleteSession: vi.fn().mockResolvedValue(undefined),
            },
            projectModel: {
                getSummary: vi.fn().mockResolvedValue(projectSummary),
                getWithSensitiveFields: vi.fn().mockResolvedValue({
                    organizationUuid: 'org-uuid',
                    warehouseConnection: null,
                }),
            },
            projectService: {
                assertConnectionPreAggregateRefresh: vi.fn(),
                assertAgentConnectionEffect: vi.fn(),
                saveDeployExplores: vi.fn().mockResolvedValue('index-job-uuid'),
                trackCliSourceDeploy,
                getDeployStartOfWeekByExplore: vi
                    .fn()
                    .mockResolvedValue(new Map()),
            },
            schedulerClient: {
                generateValidation: vi.fn().mockRejectedValue(failure),
            },
        } as never);
        const cliDeploy = {
            sourceUuid: 'finance-source-uuid',
            target: { database: 'finance' },
        };

        await expect(
            service.finalizeDeploy(
                user,
                'project-uuid',
                'deploy-session-uuid',
                undefined,
                undefined,
                cliDeploy,
            ),
        ).rejects.toBe(failure);
        expect(trackCliSourceDeploy).toHaveBeenCalledExactlyOnceWith(
            {
                userUuid: user.userUuid,
                projectUuid: 'project-uuid',
                cliDeploy,
            },
            { status: 'error', error: failure },
        );
        expect(updateStatus).toHaveBeenCalledWith(
            'deploy-session-uuid',
            DeploySessionStatus.FAILED,
        );
        expect(updateStatus).not.toHaveBeenCalledWith(
            'deploy-session-uuid',
            DeploySessionStatus.COMPLETED,
        );
    });
    it('checks the deploy permission from the project summary, so a credential error still fails the session as before', async () => {
        const failure = new Error('credentials cannot be decrypted');
        const updateStatus = vi.fn().mockResolvedValue(undefined);
        const getSummary = vi.fn().mockResolvedValue(projectSummary);
        const getWithSensitiveFields = vi.fn().mockRejectedValue(failure);
        const user = toSessionUser(
            buildAccount(
                new Ability([
                    {
                        action: 'manage',
                        subject: 'DeployProject',
                        conditions: { projectUuid: 'project-uuid' },
                    },
                ]),
            ),
        );
        const service = new DeployService({
            featureFlagModel: getFeatureFlagModel(),
            deploySessionModel: {
                getSession: vi.fn().mockResolvedValue({
                    deploySessionUuid: 'deploy-session-uuid',
                    projectUuid: 'project-uuid',
                    userUuid: user.userUuid,
                    status: DeploySessionStatus.UPLOADING,
                    batchCount: 1,
                    exploreCount: 0,
                    createdAt: new Date(),
                }),
                updateStatus,
            },
            projectModel: { getSummary, getWithSensitiveFields },
            projectService: {
                assertConnectionPreAggregateRefresh: vi.fn(),
                assertAgentConnectionEffect: vi.fn(),
                trackCliSourceDeploy: vi.fn().mockResolvedValue(undefined),
                getDeployStartOfWeekByExplore: vi
                    .fn()
                    .mockResolvedValue(new Map()),
            },
            schedulerClient: {},
        } as never);

        await expect(
            service.finalizeDeploy(
                user,
                'project-uuid',
                'deploy-session-uuid',
                'cli-1',
            ),
        ).rejects.toBe(failure);

        expect(getSummary).toHaveBeenCalledExactlyOnceWith('project-uuid');
        expect(getWithSensitiveFields).toHaveBeenCalledTimes(1);
        expect(updateStatus.mock.calls).toEqual([
            ['deploy-session-uuid', DeploySessionStatus.FINALIZING],
            ['deploy-session-uuid', DeploySessionStatus.FAILED],
        ]);
        expect(
            vi.mocked(updateStatus).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(getWithSensitiveFields).mock.invocationCallOrder[0],
        );
    });
    describe('peer flag operation snapshot', () => {
        const fixture = () => {
            const account = buildAccount(
                new Ability([
                    {
                        action: 'manage',
                        subject: 'DeployProject',
                        conditions: { projectUuid: 'project-uuid' },
                    },
                ]),
            );
            const user = toSessionUser(account);
            const featureFlagModel = getFeatureFlagModel();
            const deploySessionModel = {
                getSession: vi.fn(async () => ({
                    projectUuid: 'project-uuid',
                    userUuid: user.userUuid,
                    status: DeploySessionStatus.UPLOADING,
                })),
                getDeployData: vi.fn(async () => ({
                    explores: [],
                    complete: true,
                })),
                updateStatus: vi.fn(async () => undefined),
                deleteSession: vi.fn(async () => undefined),
            };
            const projectModel = {
                getSummary: vi.fn(async () => projectSummary),
                getWithSensitiveFields: vi.fn(async () => ({
                    organizationUuid: 'org-uuid',
                    warehouseConnection: null,
                })),
            };
            const projectService = {
                assertConnectionPreAggregateRefresh: vi.fn(
                    async () => undefined,
                ),
                assertAgentConnectionEffect: vi.fn(async () => undefined),
                getDeployStartOfWeekByExplore: vi.fn(async () => new Map()),
                saveDeployExplores: vi.fn(async () => 'index-job-uuid'),
                trackCliSourceDeploy: vi.fn(async () => undefined),
            };
            const schedulerClient = {
                generateValidation: vi.fn(async () => undefined),
            };
            const service = new DeployService({
                featureFlagModel,
                deploySessionModel,
                projectModel,
                projectService,
                schedulerClient,
            } as never);
            const run = () =>
                service.finalizeDeploy(user, 'project-uuid', 'session-uuid');
            return {
                service,
                run,
                account,
                user,
                featureFlagModel,
                deploySessionModel,
                projectModel,
                projectService,
                schedulerClient,
            };
        };

        it.each([
            { enabled: true, fails: false },
            { enabled: false, fails: false },
            { enabled: true, fails: true },
            { enabled: false, fails: true },
        ])(
            'shares one snapshot between save and analytics with enabled=$enabled and fails=$fails',
            async ({ enabled, fails }) => {
                const f = fixture();
                const failure = new Error('save failed');
                f.featureFlagModel.get.mockResolvedValueOnce({
                    id: FeatureFlags.PeerDbtSources,
                    enabled,
                });
                const observed: boolean[] = [];
                f.projectService.saveDeployExplores.mockImplementation(
                    async () => {
                        observed.push(getPeerDbtSourcesEnabled());
                        f.featureFlagModel.get.mockResolvedValue({
                            id: FeatureFlags.PeerDbtSources,
                            enabled: !enabled,
                        });
                        if (fails) throw failure;
                        return 'index-job-uuid';
                    },
                );
                f.projectService.trackCliSourceDeploy.mockImplementation(
                    async () => {
                        observed.push(getPeerDbtSourcesEnabled());
                    },
                );
                if (fails) await expect(f.run()).rejects.toBe(failure);
                else
                    await expect(f.run()).resolves.toMatchObject({
                        status: DeploySessionStatus.COMPLETED,
                    });
                expect(observed).toEqual([enabled, enabled]);
                expect(f.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
                    user: { organizationUuid: 'org-uuid' },
                    featureFlagId: FeatureFlags.PeerDbtSources,
                });
                expect(f.projectModel.getSummary).toHaveBeenCalledOnce();
                expect(
                    f.deploySessionModel.getSession.mock.invocationCallOrder[0],
                ).toBeLessThan(
                    f.projectModel.getSummary.mock.invocationCallOrder[0],
                );
                expect(
                    f.projectModel.getSummary.mock.invocationCallOrder[0],
                ).toBeLessThan(
                    f.featureFlagModel.get.mock.invocationCallOrder[0],
                );
                expect(
                    f.featureFlagModel.get.mock.invocationCallOrder[0],
                ).toBeLessThan(
                    f.deploySessionModel.updateStatus.mock
                        .invocationCallOrder[0],
                );
                expect(hasPeerDbtSourcesOperation()).toBe(false);
            },
        );

        it.each([true, false])(
            'reuses a nested snapshot of %s without a flag read',
            async (enabled) => {
                const f = fixture();
                f.projectService.saveDeployExplores.mockImplementation(
                    async () => {
                        expect(getPeerDbtSourcesEnabled()).toBe(enabled);
                        return 'index-job-uuid';
                    },
                );
                f.projectService.trackCliSourceDeploy.mockImplementation(
                    async () => {
                        expect(getPeerDbtSourcesEnabled()).toBe(enabled);
                    },
                );
                await withPeerDbtSourcesOperation(enabled, f.run);
                expect(f.featureFlagModel.get).not.toHaveBeenCalled();
            },
        );

        it('resolves again for each separate deployment', async () => {
            const f = fixture();
            const observed: boolean[] = [];
            f.projectService.saveDeployExplores.mockImplementation(async () => {
                observed.push(getPeerDbtSourcesEnabled());
                return 'index-job-uuid';
            });
            await [true, false, true].reduce(async (previous, enabled) => {
                await previous;
                f.featureFlagModel.get.mockResolvedValueOnce({
                    id: FeatureFlags.PeerDbtSources,
                    enabled,
                });
                await f.run();
            }, Promise.resolve());
            expect(observed).toEqual([true, false, true]);
            expect(f.featureFlagModel.get).toHaveBeenCalledTimes(3);
        });

        it.each(['project', 'user', 'status', 'permission'] as const)(
            'preserves the %s refusal before flag resolution',
            async (gate) => {
                const f = fixture();
                if (gate === 'project')
                    f.deploySessionModel.getSession.mockResolvedValueOnce({
                        projectUuid: 'other-project',
                        userUuid: f.user.userUuid,
                        status: DeploySessionStatus.UPLOADING,
                    });
                if (gate === 'user')
                    f.deploySessionModel.getSession.mockResolvedValueOnce({
                        projectUuid: 'project-uuid',
                        userUuid: 'other-user',
                        status: DeploySessionStatus.UPLOADING,
                    });
                if (gate === 'status')
                    f.deploySessionModel.getSession.mockResolvedValueOnce({
                        projectUuid: 'project-uuid',
                        userUuid: f.user.userUuid,
                        status: DeploySessionStatus.COMPLETED,
                    });
                if (gate === 'permission') f.user.ability = new Ability([]);
                await expect(f.run()).rejects.toThrow();
                expect(f.featureFlagModel.get).not.toHaveBeenCalled();
                expect(
                    f.deploySessionModel.updateStatus,
                ).not.toHaveBeenCalled();
                expect(
                    f.projectModel.getWithSensitiveFields,
                ).not.toHaveBeenCalled();
                expect(
                    f.projectService.saveDeployExplores,
                ).not.toHaveBeenCalled();
            },
        );

        it('keeps the agent credential guard before flag resolution and session writes', async () => {
            const f = fixture();
            const failure = new Error('agent credential refused');
            f.projectService.assertConnectionPreAggregateRefresh.mockRejectedValue(
                failure,
            );
            const context = createAgentExecutionContext({
                account: f.account,
                surface: AgentActorSurface.CLI,
                clientId: 'client-uuid',
                agentUuid: null,
                agentIdentityEnabled: true,
                agentConnectionExecution: {
                    grantUuid: 'grant-uuid',
                    revision: 1,
                    subjectUserUuid: f.user.userUuid,
                    organizationUuid: 'org-uuid',
                    clientId: 'client-uuid',
                    resource: 'https://example.test/api',
                    refreshFamilyUuid: 'refresh-uuid',
                    scopes: ['write'],
                    operation: {
                        kind: 'rest',
                        key: 'DeployController.finalizeDeploy',
                    },
                },
            });
            await expect(
                agentExecutionContext.run(context, f.run),
            ).rejects.toBe(failure);
            expect(
                f.projectService.assertConnectionPreAggregateRefresh,
            ).toHaveBeenCalledOnce();
            expect(f.featureFlagModel.get).not.toHaveBeenCalled();
            expect(f.deploySessionModel.updateStatus).not.toHaveBeenCalled();
            expect(f.projectService.saveDeployExplores).not.toHaveBeenCalled();
        });
    });
});
