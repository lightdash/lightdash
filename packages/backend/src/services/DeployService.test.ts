import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ProjectType,
    type Account,
    type MemberAbility,
} from '@lightdash/common';
import { DeployService } from './DeployService';

const buildAccount = (ability: MemberAbility): Account =>
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
    }) as Account;

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
                createSession: jest
                    .fn()
                    .mockResolvedValue('deploy-session-uuid'),
            },
            projectModel: {
                getWithSensitiveFields: jest.fn().mockResolvedValue({
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
});
