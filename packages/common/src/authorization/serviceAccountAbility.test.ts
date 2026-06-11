import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { projectMemberAbilities } from './projectMemberAbility';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { applyServiceAccountAbilities } from './serviceAccountAbility';
import { type MemberAbility } from './types';

const ORG = 'org-1';
const SA_USER = 'sa-user-1';
const PROJ_A = 'proj-a';
const PROJ_B = 'proj-b';

const buildAbility = (scopes: ServiceAccountScope[]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyServiceAccountAbilities({
        organizationUuid: ORG,
        userUuid: SA_USER,
        builder,
        scopes,
    });
    return builder.build();
};

// Mirrors UserModel.applyServiceAccountProjectMemberships:
// applies org SA scopes first, then per-project grants on the same builder.
const buildAbilityWithGrants = (
    scopes: ServiceAccountScope[],
    grants: Array<
        | { projectUuid: string; role: ProjectMemberRole }
        | { projectUuid: string; customRoleScopes: string[] }
    >,
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyServiceAccountAbilities({
        organizationUuid: ORG,
        userUuid: SA_USER,
        builder,
        scopes,
    });
    for (const grant of grants) {
        if ('role' in grant) {
            projectMemberAbilities[grant.role](
                {
                    projectUuid: grant.projectUuid,
                    userUuid: SA_USER,
                    role: grant.role,
                },
                builder,
            );
        } else {
            buildAbilityFromScopes(
                {
                    projectUuid: grant.projectUuid,
                    userUuid: SA_USER,
                    scopes: grant.customRoleScopes,
                    isEnterprise: true,
                    permissionsConfig: {
                        pat: { enabled: true, allowedOrgRoles: [] },
                    },
                },
                builder,
            );
        }
    }
    return builder.build();
};

describe('ServiceAccountScope.SYSTEM_MEMBER', () => {
    it('grants the same abilities as a human Member', () => {
        const ability = buildAbility([ServiceAccountScope.SYSTEM_MEMBER]);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: ORG,
                }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                subject('PinnedItems', { organizationUuid: ORG }),
            ),
        ).toBe(true);
    });

    it('grants no org-wide content abilities', () => {
        const ability = buildAbility([ServiceAccountScope.SYSTEM_MEMBER]);
        expect(
            ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: ORG,
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(false);
        expect(
            ability.can('view', subject('Project', { organizationUuid: ORG })),
        ).toBe(false);
    });
});

describe('SYSTEM_MEMBER + project_memberships (system roles)', () => {
    // Parity: SA with a system-role grant should view/manage in that project
    // the same way a human ProjectMember with that role does. Drives off
    // projectMemberAbilities so adding a 6th role would surface here.
    const expectations: Array<{
        role: ProjectMemberRole;
        canViewProject: boolean;
        canManageProject: boolean;
    }> = [
        {
            role: ProjectMemberRole.VIEWER,
            canViewProject: true,
            canManageProject: false,
        },
        {
            role: ProjectMemberRole.INTERACTIVE_VIEWER,
            canViewProject: true,
            canManageProject: false,
        },
        {
            role: ProjectMemberRole.EDITOR,
            canViewProject: true,
            canManageProject: false,
        },
        {
            role: ProjectMemberRole.DEVELOPER,
            canViewProject: true,
            canManageProject: false,
        },
        {
            role: ProjectMemberRole.ADMIN,
            canViewProject: true,
            canManageProject: true,
        },
    ];

    it.each(expectations)(
        '$role grants view=$canViewProject, manage=$canManageProject on the granted project only',
        ({ role, canViewProject, canManageProject }) => {
            const ability = buildAbilityWithGrants(
                [ServiceAccountScope.SYSTEM_MEMBER],
                [{ projectUuid: PROJ_A, role }],
            );
            expect(
                ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid: ORG,
                        projectUuid: PROJ_A,
                    }),
                ),
            ).toBe(canViewProject);
            expect(
                ability.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: ORG,
                        projectUuid: PROJ_A,
                    }),
                ),
            ).toBe(canManageProject);
            // No bleed-through to an ungranted project.
            expect(
                ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid: ORG,
                        projectUuid: PROJ_B,
                    }),
                ),
            ).toBe(false);
        },
    );

    it('covers every key of projectMemberAbilities (drift sentinel)', () => {
        // If a new system role lands without a matching expectations row,
        // this assertion fails loudly — preventing silent gaps in coverage.
        expect(new Set(expectations.map((e) => e.role))).toEqual(
            new Set(Object.keys(projectMemberAbilities)),
        );
    });
});

describe('SYSTEM_MEMBER + project_memberships (custom roles)', () => {
    it('honors custom-role scopes on the granted project, not elsewhere', () => {
        const ability = buildAbilityWithGrants(
            [ServiceAccountScope.SYSTEM_MEMBER],
            [
                {
                    projectUuid: PROJ_A,
                    customRoleScopes: ['view:Dashboard'],
                },
            ],
        );
        expect(
            ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_A,
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(true);
        // Same action, different project → denied.
        expect(
            ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_B,
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(false);
        // Scope NOT granted → denied even on the right project.
        expect(
            ability.can(
                'manage',
                subject('Dashboard', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_A,
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(false);
    });

    it('mixes system + custom grants across projects on the same SA', () => {
        const ability = buildAbilityWithGrants(
            [ServiceAccountScope.SYSTEM_MEMBER],
            [
                { projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER },
                { projectUuid: PROJ_B, customRoleScopes: ['view:Dashboard'] },
            ],
        );
        // System Viewer on A: can view the project itself.
        expect(
            ability.can(
                'view',
                subject('Project', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_A,
                }),
            ),
        ).toBe(true);
        // Custom role on B lacks view:Project, so the Project subject is denied
        // even though Dashboard would be allowed.
        expect(
            ability.can(
                'view',
                subject('Project', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_B,
                }),
            ),
        ).toBe(false);
        expect(
            ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: ORG,
                    projectUuid: PROJ_B,
                    inheritsFromOrgOrProject: true,
                }),
            ),
        ).toBe(true);
    });

    it('grants are additive — SYSTEM_MEMBER org abilities still apply', () => {
        // Project grant doesn't shadow the org-level OrganizationMemberProfile
        // view that SYSTEM_MEMBER itself provides.
        const ability = buildAbilityWithGrants(
            [ServiceAccountScope.SYSTEM_MEMBER],
            [{ projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER }],
        );
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: ORG,
                }),
            ),
        ).toBe(true);
    });
});
