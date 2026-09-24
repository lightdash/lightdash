import { Ability, AbilityBuilder } from '@casl/ability';
import {
    DeploySessionStatus,
    NotImplementedError,
    ProjectType,
    type MemberAbility,
    type RegisteredAccount,
} from '@lightdash/common';
import { toSessionUser } from '../auth/account';
import { DeployService } from './DeployService';

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

describe('DeployService', () => {
    it('allows starting a deploy session for an own preview from a granted upstream project', async () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('manage', 'DeployProject', {
            upstreamProjectUuid: 'upstream-project-uuid',
            createdByUserUuid: 'service-account-user-uuid',
            type: ProjectType.PREVIEW,
        });

        const service = new DeployService({
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
            projectService: {},
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
                saveDeployExplores: vi.fn().mockResolvedValue('index-job-uuid'),
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
                deploySessionModel,
                projectModel: {
                    requireSingleConnectionRoute: vi
                        .fn()
                        .mockResolvedValue('single'),
                    getWithSensitiveFields: vi.fn().mockResolvedValue({
                        organizationUuid: 'org-uuid',
                        warehouseConnection: null,
                    }),
                },
                projectService,
                schedulerClient,
            } as never);
            const user = toSessionUser(buildAccount(new Ability()));

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
                    projectDbtSourceUuid: null,
                }),
            );
        },
    );

    it('refuses to start a deploy session for a project that routes multi', async () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        builder.can('manage', 'DeployProject');
        const createSession = vi.fn().mockResolvedValue('deploy-session-uuid');
        const requireSingleConnectionRoute = vi
            .fn()
            .mockRejectedValue(
                new NotImplementedError(
                    'Multiple connections are not available',
                ),
            );
        const service = new DeployService({
            deploySessionModel: { createSession },
            projectModel: {
                requireSingleConnectionRoute,
                getWithSensitiveFields: vi.fn().mockResolvedValue({
                    projectUuid: 'project-uuid',
                    organizationUuid: 'org-uuid',
                    name: 'Project',
                    type: ProjectType.DEFAULT,
                }),
            },
            projectService: {},
            schedulerClient: {},
        } as never);

        await expect(
            service.startDeploySession(
                buildAccount(builder.build()),
                'project-uuid',
            ),
        ).rejects.toThrow('Multiple connections are not available');
        expect(requireSingleConnectionRoute).toHaveBeenCalledWith(
            'project-uuid',
            { kind: 'original' },
        );
        expect(createSession).not.toHaveBeenCalled();
    });

    it('refuses to finalize a deploy for a project that routes multi', async () => {
        const updateStatus = vi.fn().mockResolvedValue(undefined);
        const saveDeployExplores = vi.fn();
        const requireSingleConnectionRoute = vi
            .fn()
            .mockRejectedValue(
                new NotImplementedError(
                    'Multiple connections are not available',
                ),
            );
        const user = toSessionUser(buildAccount(new Ability()));
        const service = new DeployService({
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
            projectModel: {
                requireSingleConnectionRoute,
                getWithSensitiveFields: vi.fn(),
            },
            projectService: { saveDeployExplores },
            schedulerClient: {},
        } as never);

        await expect(
            service.finalizeDeploy(user, 'project-uuid', 'deploy-session-uuid'),
        ).rejects.toThrow('Multiple connections are not available');
        expect(requireSingleConnectionRoute).toHaveBeenCalledWith(
            'project-uuid',
            { kind: 'original' },
        );
        expect(updateStatus).not.toHaveBeenCalled();
        expect(saveDeployExplores).not.toHaveBeenCalled();
    });
});
