import { subject } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { getUserAbilityBuilder } from './index';

const organizationUuid = 'learn-org';
const userUuid = 'learner';
const customRoleUuid = 'custom-role';
const permissionsConfig = { pat: { enabled: false, allowedOrgRoles: [] } };

describe('Learn access', () => {
    it.each(Object.values(OrganizationMemberRole))(
        'grants organization system role %s access only in its organization',
        (role) => {
            const { builder } = getUserAbilityBuilder({
                user: { role, organizationUuid, userUuid },
                projectProfiles: [],
                permissionsConfig,
            });
            const ability = builder.build();
            expect(
                ability.can('view', subject('Learn', { organizationUuid })),
            ).toBe(true);
            expect(
                ability.can(
                    'view',
                    subject('Learn', { organizationUuid: 'another-org' }),
                ),
            ).toBe(false);
        },
    );

    it.each([true, false])(
        'requires an explicit organization custom-role grant (enterprise: %s)',
        (isEnterprise) => {
            for (const scopes of [[], ['view:Learn']]) {
                const { builder } = getUserAbilityBuilder({
                    user: {
                        role: OrganizationMemberRole.MEMBER,
                        organizationUuid,
                        userUuid,
                        roleUuid: customRoleUuid,
                    },
                    projectProfiles: [
                        {
                            projectUuid: 'project',
                            role: ProjectMemberRole.VIEWER,
                            userUuid,
                            roleUuid: 'project-role',
                        },
                    ],
                    customRoleScopes: {
                        [customRoleUuid]: scopes,
                        'project-role': ['view:Learn'],
                    },
                    customRolesEnabled: true,
                    isEnterprise,
                    permissionsConfig,
                });
                const ability = builder.build();
                expect(
                    ability.can('view', subject('Learn', { organizationUuid })),
                ).toBe(scopes.length > 0);
                expect(
                    ability.can(
                        'view',
                        subject('Learn', { organizationUuid: 'another-org' }),
                    ),
                ).toBe(false);
            }
        },
    );
});
