import { Ability, AbilityBuilder } from '@casl/ability';
import {
    DeploySessionStatus,
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
                    cliDeploy: { sourceUuid: null, target: null },
                }),
            );
        },
    );

    it('passes the dbt source and the dbt target of the CLI to the cache write', async () => {
        const saveDeployExplores = vi.fn().mockResolvedValue('index-job-uuid');
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
                updateStatus: vi.fn().mockResolvedValue(undefined),
                getDeployData: vi
                    .fn()
                    .mockResolvedValue({ explores: [], complete: true }),
                deleteSession: vi.fn().mockResolvedValue(undefined),
            },
            projectModel: {
                getWithSensitiveFields: vi.fn().mockResolvedValue({
                    organizationUuid: 'org-uuid',
                    warehouseConnection: null,
                }),
            },
            projectService: { saveDeployExplores },
            schedulerClient: {
                generateValidation: vi.fn().mockResolvedValue(undefined),
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
    });
});
