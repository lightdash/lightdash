import { subject } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { getUserAbilityBuilder } from './index';

const ORG_UUID = 'roadmap-org-uuid';
const PROJECT_UUID = 'roadmap-project-uuid';
const USER_UUID = 'roadmap-user-uuid';
const CUSTOM_ROLE_UUID = '44444444-4444-4444-a444-444444444444';

const PERMISSIONS_CONFIG = {
    pat: { enabled: false, allowedOrgRoles: [] },
};

const canViewRoadmap = ({
    role = OrganizationMemberRole.MEMBER,
    orgRoleUuid,
    projectRoleUuid,
    scopes = ['view:Roadmap'],
    customRolesEnabled = true,
    isEnterprise = true,
}: {
    role?: OrganizationMemberRole;
    orgRoleUuid?: string;
    projectRoleUuid?: string;
    scopes?: string[];
    customRolesEnabled?: boolean;
    isEnterprise?: boolean;
}): boolean => {
    const { builder } = getUserAbilityBuilder({
        user: {
            role,
            organizationUuid: ORG_UUID,
            userUuid: USER_UUID,
            roleUuid: orgRoleUuid,
        },
        projectProfiles: projectRoleUuid
            ? [
                  {
                      projectUuid: PROJECT_UUID,
                      role: ProjectMemberRole.VIEWER,
                      userUuid: USER_UUID,
                      roleUuid: projectRoleUuid,
                  },
              ]
            : [],
        permissionsConfig: PERMISSIONS_CONFIG,
        customRoleScopes: { [CUSTOM_ROLE_UUID]: scopes },
        customRolesEnabled,
        isEnterprise,
    });

    return builder
        .build()
        .can('view', subject('Roadmap', { organizationUuid: ORG_UUID }));
};

describe('Roadmap access', () => {
    describe('System roles', () => {
        it('grants the organization admin access', () => {
            expect(canViewRoadmap({ role: OrganizationMemberRole.ADMIN })).toBe(
                true,
            );
        });

        it.each([
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.DEVELOPER,
        ])('denies %s — access stays explicit-grant only', (role) => {
            expect(canViewRoadmap({ role })).toBe(false);
        });
    });

    describe('Organization-level custom role', () => {
        it('grants a non-admin the roadmap when the role includes view:Roadmap', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.VIEWER,
                    orgRoleUuid: CUSTOM_ROLE_UUID,
                }),
            ).toBe(true);
        });

        it('denies a non-admin when the role omits view:Roadmap', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.VIEWER,
                    orgRoleUuid: CUSTOM_ROLE_UUID,
                    scopes: ['view:Dashboard', 'view:Project'],
                }),
            ).toBe(false);
        });

        it('scopes the grant to the assigning organization', () => {
            const { builder } = getUserAbilityBuilder({
                user: {
                    role: OrganizationMemberRole.VIEWER,
                    organizationUuid: ORG_UUID,
                    userUuid: USER_UUID,
                    roleUuid: CUSTOM_ROLE_UUID,
                },
                projectProfiles: [],
                permissionsConfig: PERMISSIONS_CONFIG,
                customRoleScopes: { [CUSTOM_ROLE_UUID]: ['view:Roadmap'] },
                customRolesEnabled: true,
                isEnterprise: true,
            });

            expect(
                builder.build().can(
                    'view',
                    subject('Roadmap', {
                        organizationUuid: 'another-organization',
                    }),
                ),
            ).toBe(false);
        });

        it('denies when custom roles are disabled — the assignment falls back to the system role', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.VIEWER,
                    orgRoleUuid: CUSTOM_ROLE_UUID,
                    customRolesEnabled: false,
                }),
            ).toBe(false);
        });

        it('denies without an enterprise license — view:Roadmap is an enterprise scope', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.VIEWER,
                    orgRoleUuid: CUSTOM_ROLE_UUID,
                    isEnterprise: false,
                }),
            ).toBe(false);
        });

        it('replaces the system role, so an admin assigned a role without view:Roadmap loses it', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.ADMIN,
                    orgRoleUuid: CUSTOM_ROLE_UUID,
                    scopes: ['view:Dashboard'],
                }),
            ).toBe(false);
        });
    });

    describe('Project-level assignment', () => {
        it('grants nothing — view:Roadmap builds a projectUuid condition that never matches the org-keyed subject', () => {
            expect(
                canViewRoadmap({
                    role: OrganizationMemberRole.VIEWER,
                    projectRoleUuid: CUSTOM_ROLE_UUID,
                }),
            ).toBe(false);
        });
    });
});
