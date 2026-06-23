import { subject, type AbilityBuilder, type RawRuleOf } from '@casl/ability';
import {
    LightdashMode,
    MemberAbility,
    OrganizationMemberRole,
    projectMemberAbilities,
    ProjectMemberRole,
    ServiceAccountScope,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type LightdashConfig } from '../config/parseConfig';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { UserModel, type DbUserDetails } from './UserModel';

type TestableUserModel = {
    hasAuthentication: (userUuid: string) => Promise<boolean>;
    getUserProjectRoles: (userUuid: string) => Promise<never[]>;
    getUserGroupProjectRoles: (
        userId: number,
        organizationId: number,
        userUuid: string,
    ) => Promise<never[]>;
    findServiceAccountByUserUuid: (userUuid: string) => Promise<
        | {
              uuid: string;
              description: string;
              scopes: ServiceAccountScope[];
              organizationUuid: string;
          }
        | undefined
    >;
    customRoleScopes: (
        roleUuids: string[],
    ) => Promise<Record<string, string[]>>;
    applyServiceAccountProjectMemberships: (
        userId: number,
        userUuid: string,
        builder: AbilityBuilder<MemberAbility>,
    ) => Promise<void>;
    generateUserAbilityBuilder: (user: DbUserDetails) => Promise<{
        abilityBuilder: AbilityBuilder<MemberAbility>;
    }>;
};

const lightdashConfig = {
    mode: LightdashMode.DEFAULT,
    auth: {
        pat: { enabled: false, allowedOrgRoles: [] },
    },
    license: {},
    customRoles: { enabled: false },
    rudder: {},
} as unknown as LightdashConfig;

const featureFlagModel = {
    get: jest.fn(async () => ({ enabled: false })),
} as unknown as FeatureFlagModel;

const userDetails: DbUserDetails = {
    user_id: 1,
    user_uuid: 'service-account-user',
    first_name: 'Service',
    last_name: 'Account',
    created_at: new Date('2024-01-01'),
    is_tracking_anonymized: false,
    is_marketing_opted_in: false,
    email: 'service-account@example.com',
    organization_uuid: 'org-1',
    organization_name: 'Org 1',
    organization_created_at: new Date('2024-01-01'),
    organization_id: 10,
    is_setup_complete: true,
    role: OrganizationMemberRole.MEMBER,
    role_uuid: undefined,
    is_active: true,
    is_internal: true,
    timezone: null,
    updated_at: new Date('2024-01-01'),
};

const createUserModel = (): TestableUserModel => {
    const model = new UserModel({
        database: jest.fn() as unknown as Knex,
        lightdashConfig,
        featureFlagModel,
    }) as unknown as TestableUserModel;

    model.hasAuthentication = jest.fn(async () => true);
    model.getUserProjectRoles = jest.fn(async () => []);
    model.getUserGroupProjectRoles = jest.fn(async () => []);
    model.findServiceAccountByUserUuid = jest.fn(async (userUuid) => ({
        uuid: 'service-account',
        description: 'Service account',
        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
        organizationUuid: 'org-1',
    }));
    model.customRoleScopes = jest.fn(async () => ({
        'custom-role': ['view:Dashboard'],
    }));
    model.applyServiceAccountProjectMemberships = jest.fn(
        async (_userId, userUuid, builder) => {
            Array.from({ length: 125 }, (_, i) => `project-${i}`).forEach(
                (projectUuid) => {
                    projectMemberAbilities[ProjectMemberRole.ADMIN](
                        {
                            projectUuid,
                            role: ProjectMemberRole.ADMIN,
                            userUuid,
                        },
                        builder,
                    );
                },
            );
        },
    );

    return model;
};

const expectCollapsedDashboardProjectRule = (
    rules: AbilityBuilder<MemberAbility>['rules'],
) => {
    const dashboardRule = rules.find(
        (rule: RawRuleOf<MemberAbility>) =>
            rule.subject === 'Dashboard' &&
            rule.action === 'view' &&
            Boolean(
                (
                    rule.conditions as
                        | Record<string, { $in?: string[] }>
                        | undefined
                )?.projectUuid?.$in,
            ),
    );

    if (!dashboardRule) {
        throw new Error(
            'Expected service account Dashboard rule to be collapsed',
        );
    }

    expect(rules.length).toBeLessThan(100);
    expect(
        (dashboardRule.conditions as Record<string, { $in: string[] }>)
            .projectUuid.$in,
    ).toHaveLength(125);
};

describe('UserModel', () => {
    it('collapses legacy service account project membership rules before returning the ability builder', async () => {
        const model = createUserModel();

        const { abilityBuilder } =
            await model.generateUserAbilityBuilder(userDetails);
        const ability = abilityBuilder.build();

        expectCollapsedDashboardProjectRule(abilityBuilder.rules);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: 'org-1',
                }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: 'other-org',
                }),
            ),
        ).toBe(false);
    });

    it('collapses custom-role service account project membership rules before returning the ability builder', async () => {
        const model = createUserModel();

        const { abilityBuilder } = await model.generateUserAbilityBuilder({
            ...userDetails,
            role_uuid: 'custom-role',
        });

        expect(model.customRoleScopes).toHaveBeenCalledWith(['custom-role']);
        expect(model.findServiceAccountByUserUuid).not.toHaveBeenCalled();
        expectCollapsedDashboardProjectRule(abilityBuilder.rules);
    });
});
