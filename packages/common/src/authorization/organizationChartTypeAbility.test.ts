import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import {
    getUserAbilityBuilder,
    grantOrganizationChartTypeViewForChartBuilders,
    type ProjectAbilityProfile,
} from './index';
import { projectMemberAbilities } from './projectMemberAbility';
import { getScopes } from './scopes';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const ORGANIZATION_UUID = 'organization-1';
const OTHER_ORGANIZATION_UUID = 'organization-2';
const USER_UUID = 'user-1';
const PROJECT_UUID = 'project-1';
const CUSTOM_ROLE_UUID = 'custom-role-1';

const chartType = (organizationUuid = ORGANIZATION_UUID) =>
    subject('OrganizationChartType', { organizationUuid });

const projectProfile = (
    role: ProjectMemberRole,
    roleUuid?: string,
    organizationUuid = ORGANIZATION_UUID,
): ProjectAbilityProfile => ({
    projectUuid: PROJECT_UUID,
    organizationUuid,
    userUuid: USER_UUID,
    role,
    roleUuid,
});

const userAbility = ({
    organizationRole = OrganizationMemberRole.VIEWER,
    organizationRoleUuid,
    projects = [],
    customScopes = [],
}: {
    organizationRole?: OrganizationMemberRole;
    organizationRoleUuid?: string;
    projects?: ProjectAbilityProfile[];
    customScopes?: string[];
}) =>
    getUserAbilityBuilder({
        user: {
            role: organizationRole,
            roleUuid: organizationRoleUuid,
            organizationUuid: ORGANIZATION_UUID,
            userUuid: USER_UUID,
        },
        projectProfiles: projects,
        permissionsConfig: {
            pat: { enabled: false, allowedOrgRoles: [] },
        },
        customRoleScopes: { [CUSTOM_ROLE_UUID]: customScopes },
        customRolesEnabled: true,
        isEnterprise: false,
    });

describe('organization chart type permissions', () => {
    it('grants an organization admin management without a project and binds it to the target organization', () => {
        const ability = userAbility({
            organizationRole: OrganizationMemberRole.ADMIN,
        }).builder.build();

        expect(ability.can('manage', chartType())).toBe(true);
        expect(ability.can('view', chartType())).toBe(true);
        expect(ability.can('manage', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
        expect(ability.can('view', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
    });

    it.each([
        OrganizationMemberRole.MEMBER,
        OrganizationMemberRole.VIEWER,
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
    ])('does not grant %s management', (organizationRole) => {
        const ability = userAbility({
            organizationRole,
            projects: [projectProfile(ProjectMemberRole.ADMIN)],
        }).builder.build();

        expect(ability.can('manage', chartType())).toBe(false);
    });

    it.each([
        ProjectMemberRole.INTERACTIVE_VIEWER,
        ProjectMemberRole.EDITOR,
        ProjectMemberRole.DEVELOPER,
        ProjectMemberRole.ADMIN,
    ])('lets a %s project chart builder view the org library', (role) => {
        const ability = userAbility({
            projects: [projectProfile(role)],
        }).builder.build();

        expect(ability.can('view', chartType())).toBe(true);
        expect(ability.can('view', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
        expect(ability.can('manage', chartType())).toBe(false);
    });

    it.each([
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ])(
        'lets a %s org member view the org library without a project',
        (organizationRole) => {
            const ability = userAbility({ organizationRole }).builder.build();

            expect(ability.can('view', chartType())).toBe(true);
            expect(
                ability.can('view', chartType(OTHER_ORGANIZATION_UUID)),
            ).toBe(false);
        },
    );

    it('denies an org viewer and a project viewer', () => {
        expect(
            userAbility({
                projects: [projectProfile(ProjectMemberRole.VIEWER)],
            })
                .builder.build()
                .can('view', chartType()),
        ).toBe(false);
        expect(
            userAbility({
                organizationRole: OrganizationMemberRole.MEMBER,
            })
                .builder.build()
                .can('view', chartType()),
        ).toBe(false);
    });

    it('ignores chart-building permissions on projects in a different organization', () => {
        const ability = userAbility({
            projects: [
                projectProfile(ProjectMemberRole.VIEWER),
                {
                    ...projectProfile(
                        ProjectMemberRole.ADMIN,
                        undefined,
                        OTHER_ORGANIZATION_UUID,
                    ),
                    projectUuid: 'other-organization-project',
                },
            ],
        }).builder.build();

        expect(ability.can('view', chartType())).toBe(false);
        expect(ability.can('view', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
    });

    it('derives project custom-role reader eligibility from chart and query permissions', () => {
        const customScopes = [
            'view:Project',
            'manage:Explore',
            'manage:SavedChart@space',
        ];
        const ability = userAbility({
            projects: [
                projectProfile(ProjectMemberRole.VIEWER, CUSTOM_ROLE_UUID),
            ],
            customScopes,
        }).builder.build();
        const withoutExplore = userAbility({
            projects: [
                projectProfile(ProjectMemberRole.VIEWER, CUSTOM_ROLE_UUID),
            ],
            customScopes: customScopes.filter(
                (scope) => scope !== 'manage:Explore',
            ),
        }).builder.build();

        expect(ability.can('view', chartType())).toBe(true);
        expect(withoutExplore.can('view', chartType())).toBe(false);
    });

    it('derives org custom-role reader eligibility from org-wide chart permissions', () => {
        const customScopes = [
            'view:Project',
            'manage:Explore',
            'manage:SavedChart@space',
        ];
        const ability = userAbility({
            organizationRole: OrganizationMemberRole.MEMBER,
            organizationRoleUuid: CUSTOM_ROLE_UUID,
            customScopes,
        }).builder.build();
        const withoutExplore = userAbility({
            organizationRole: OrganizationMemberRole.MEMBER,
            organizationRoleUuid: CUSTOM_ROLE_UUID,
            customScopes: customScopes.filter(
                (scope) => scope !== 'manage:Explore',
            ),
        }).builder.build();

        expect(ability.can('view', chartType())).toBe(true);
        expect(ability.can('manage', chartType())).toBe(false);
        expect(withoutExplore.can('view', chartType())).toBe(false);
    });

    it('has no assignable organization chart type scope', () => {
        const { builder, invalidScopes } = userAbility({
            organizationRole: OrganizationMemberRole.MEMBER,
            organizationRoleUuid: CUSTOM_ROLE_UUID,
            customScopes: [
                'view:OrganizationChartType',
                'manage:OrganizationChartType',
            ],
        });
        const ability = builder.build();

        expect(ability.can('view', chartType())).toBe(false);
        expect(ability.can('manage', chartType())).toBe(false);
        expect(invalidScopes).toEqual(
            expect.arrayContaining([
                'view:OrganizationChartType',
                'manage:OrganizationChartType',
            ]),
        );
        expect(
            getScopes({ isEnterprise: true }).some((scope) =>
                scope.name.endsWith(':OrganizationChartType'),
            ),
        ).toBe(false);
    });
});

describe('service-account chart type permissions', () => {
    const serviceAccountAbility = (
        scopes: ServiceAccountScope[],
        projectRole?: ProjectMemberRole,
    ) => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            organizationUuid: ORGANIZATION_UUID,
            userUuid: USER_UUID,
            builder,
            scopes,
        });
        if (projectRole) {
            projectMemberAbilities[projectRole](
                {
                    projectUuid: PROJECT_UUID,
                    userUuid: USER_UUID,
                    role: projectRole,
                },
                builder,
            );
        }
        grantOrganizationChartTypeViewForChartBuilders(builder, {
            organizationUuid: ORGANIZATION_UUID,
            userUuid: USER_UUID,
            projects: projectRole
                ? [
                      {
                          projectUuid: PROJECT_UUID,
                          organizationUuid: ORGANIZATION_UUID,
                      },
                  ]
                : [],
        });
        return builder.build();
    };

    it.each([ServiceAccountScope.ORG_ADMIN, ServiceAccountScope.SYSTEM_ADMIN])(
        'grants %s management in its organization only',
        (scope) => {
            const ability = serviceAccountAbility([scope]);

            expect(ability.can('manage', chartType())).toBe(true);
            expect(
                ability.can('manage', chartType(OTHER_ORGANIZATION_UUID)),
            ).toBe(false);
        },
    );

    it.each([
        ServiceAccountScope.ORG_READ,
        ServiceAccountScope.ORG_EDIT,
        ServiceAccountScope.SYSTEM_MEMBER,
        ServiceAccountScope.SYSTEM_EDITOR,
        ServiceAccountScope.SCIM_MANAGE,
    ])('does not grant %s chart type management', (scope) => {
        expect(serviceAccountAbility([scope]).can('manage', chartType())).toBe(
            false,
        );
    });

    it.each([
        ServiceAccountScope.ORG_READ,
        ServiceAccountScope.ORG_EDIT,
        ServiceAccountScope.SYSTEM_EDITOR,
    ])('lets a %s service account view without a project', (scope) => {
        const ability = serviceAccountAbility([scope]);

        expect(ability.can('view', chartType())).toBe(true);
        expect(ability.can('manage', chartType())).toBe(false);
        expect(ability.can('view', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
    });

    it.each([
        ServiceAccountScope.SYSTEM_MEMBER,
        ServiceAccountScope.SCIM_MANAGE,
    ])('does not let a %s service account view without a project', (scope) => {
        expect(serviceAccountAbility([scope]).can('view', chartType())).toBe(
            false,
        );
    });

    it('lets a project-scoped service account build charts without management', () => {
        const ability = serviceAccountAbility(
            [ServiceAccountScope.SYSTEM_MEMBER],
            ProjectMemberRole.EDITOR,
        );

        expect(ability.can('view', chartType())).toBe(true);
        expect(ability.can('manage', chartType())).toBe(false);
        expect(ability.can('view', chartType(OTHER_ORGANIZATION_UUID))).toBe(
            false,
        );
    });

    it('does not let another organization project unlock this service account library', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyServiceAccountAbilities({
            organizationUuid: ORGANIZATION_UUID,
            userUuid: USER_UUID,
            builder,
            scopes: [ServiceAccountScope.SYSTEM_MEMBER],
        });
        projectMemberAbilities[ProjectMemberRole.ADMIN](
            {
                projectUuid: PROJECT_UUID,
                userUuid: USER_UUID,
                role: ProjectMemberRole.ADMIN,
            },
            builder,
        );
        grantOrganizationChartTypeViewForChartBuilders(builder, {
            organizationUuid: ORGANIZATION_UUID,
            userUuid: USER_UUID,
            projects: [
                {
                    projectUuid: PROJECT_UUID,
                    organizationUuid: OTHER_ORGANIZATION_UUID,
                },
            ],
        });

        expect(builder.build().can('view', chartType())).toBe(false);
    });
});
