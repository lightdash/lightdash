import { Ability, AbilityBuilder } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { getUserAbilityBuilder } from './index';
import applyOrganizationMemberAbilities from './organizationMemberAbility';
import { type MemberAbility } from './types';

const ORG_UUID = 'test-org-uuid';
const USER_UUID = 'test-user-uuid';
const CUSTOM_ROLE_UUID = '11111111-1111-4111-a111-111111111111';

const PERMISSIONS_CONFIG = {
    pat: { enabled: false, allowedOrgRoles: [] },
};

const buildExpected = (role: OrganizationMemberRole) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyOrganizationMemberAbilities({
        role,
        member: { organizationUuid: ORG_UUID, userUuid: USER_UUID },
        builder,
        permissionsConfig: PERMISSIONS_CONFIG,
    });
    return builder.build().rules;
};

const ruleSetEqual = (a: unknown[], b: unknown[]) => {
    expect(a.length).toBe(b.length);
    expect(JSON.stringify(a.slice().sort())).toBe(
        JSON.stringify(b.slice().sort()),
    );
};

describe('getUserAbilityBuilder — org-level role resolution', () => {
    describe('Backwards compatibility with system roles', () => {
        it.each([
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.DEVELOPER,
            OrganizationMemberRole.ADMIN,
        ])(
            '%s user without roleUuid uses the system role path (unchanged)',
            (role) => {
                const builder = getUserAbilityBuilder({
                    user: {
                        role,
                        organizationUuid: ORG_UUID,
                        userUuid: USER_UUID,
                        roleUuid: undefined,
                    },
                    projectProfiles: [],
                    permissionsConfig: PERMISSIONS_CONFIG,
                });
                ruleSetEqual(builder.build().rules, buildExpected(role));
            },
        );
    });

    describe('Custom-roles feature flag', () => {
        it('falls through to the system role path when customRolesEnabled=false (even if roleUuid is set)', () => {
            const builder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.ADMIN,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: CUSTOM_ROLE_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: { [CUSTOM_ROLE_UUID]: ['view:Dashboard'] },
                customRolesEnabled: false, // gate off
            });
            ruleSetEqual(
                builder.build().rules,
                buildExpected(OrganizationMemberRole.ADMIN),
            );
        });

        it('falls through to the system role path when customRolesEnabled=true but the role has no scopes loaded', () => {
            const builder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.ADMIN,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: CUSTOM_ROLE_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: {}, // no scopes for this role
                customRolesEnabled: true,
            });
            ruleSetEqual(
                builder.build().rules,
                buildExpected(OrganizationMemberRole.ADMIN),
            );
        });
    });

    describe('Org-level custom role active', () => {
        it('uses the scope-derived path when roleUuid + customRolesEnabled + scopes are all present', () => {
            // A custom role granting only view:Dashboard. Admin's normal
            // abilities should NOT appear (e.g. manage:InviteLink).
            const builder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.ADMIN, // ignored — custom role wins
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: CUSTOM_ROLE_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: { [CUSTOM_ROLE_UUID]: ['view:Dashboard'] },
                customRolesEnabled: true,
            });
            const ability = builder.build();
            // Custom role grants what the scope says
            expect(
                ability.rules.find((r) => r.subject === 'Dashboard'),
            ).toBeDefined();
            // Admin abilities are NOT present
            expect(
                ability.rules.find((r) => r.subject === 'InviteLink'),
            ).toBeUndefined();
            expect(
                ability.rules.find((r) => r.subject === 'Organization'),
            ).toBeUndefined();
        });

        it('different custom roles produce different abilities (smoke)', () => {
            const READ_ONLY_UUID = '22222222-2222-4222-a222-222222222222';
            const EDIT_UUID = '33333333-3333-4333-a333-333333333333';

            const readOnlyBuilder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.MEMBER,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: READ_ONLY_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: {
                    [READ_ONLY_UUID]: ['view:Dashboard'],
                    [EDIT_UUID]: ['view:Dashboard', 'manage:Dashboard'],
                },
                customRolesEnabled: true,
            });

            const editBuilder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.MEMBER,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: EDIT_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: {
                    [READ_ONLY_UUID]: ['view:Dashboard'],
                    [EDIT_UUID]: ['view:Dashboard', 'manage:Dashboard'],
                },
                customRolesEnabled: true,
            });

            const readOnlyRules = readOnlyBuilder.build().rules;
            const editRules = editBuilder.build().rules;
            // Edit role has manage rules; readOnly does not
            expect(editRules.some((r) => r.action === 'manage')).toBe(true);
            expect(readOnlyRules.some((r) => r.action === 'manage')).toBe(
                false,
            );
        });
    });

    describe('Project profile resolution still works alongside org-level custom roles', () => {
        it('combines org system role with project-level system role', () => {
            const PROJECT_UUID = 'test-project-uuid';
            const builder = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.MEMBER,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: undefined,
                },
                projectProfiles: [
                    {
                        projectUuid: PROJECT_UUID,
                        role: 'admin' as never, // ProjectMemberRole.ADMIN
                        userUuid: USER_UUID,
                        roleUuid: undefined,
                    },
                ],
                permissionsConfig: PERMISSIONS_CONFIG,
            });
            const { rules } = builder.build();
            // Org member abilities (minimal) plus project admin abilities
            expect(rules.length).toBeGreaterThan(0);
        });
    });
});
