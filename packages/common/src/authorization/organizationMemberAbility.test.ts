import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { OrganizationMemberProfile } from '../types/organizationMemberProfile';
import { organizationMemberAbilities } from './organizationMemberAbility';
import {
    ORGANIZATION_ADMIN,
    ORGANIZATION_DEVELOPER,
    ORGANIZATION_EDITOR,
    ORGANIZATION_INTERACTIVE_VIEWER,
    ORGANIZATION_MEMBER,
    ORGANIZATION_VIEWER,
} from './organizationMemberAbility.mock';
import { MemberAbility } from './types';

const defineAbilityForOrganizationMember = (
    member:
        | Pick<
              OrganizationMemberProfile,
              'role' | 'organizationUuid' | 'userUuid'
          >
        | undefined,
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (member) {
        organizationMemberAbilities[member.role](member, builder);
    }
    return builder.build();
};

describe('Organization member permissions', () => {
    let ability = defineAbilityForOrganizationMember(ORGANIZATION_VIEWER);
    describe('when user is an organization admin', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_ADMIN);
        });
        it('can manage organizations', () => {
            expect(ability.can('manage', 'Organization')).toEqual(true);
        });
        it('cannot manage another organization', () => {
            const org = { organizationUuid: '789' };
            expect(ability.can('manage', subject('Organization', org))).toEqual(
                false,
            );
        });
        it('can manage their own organization', () => {
            const org = { organizationUuid: '456' };
            expect(ability.can('manage', subject('Organization', org))).toEqual(
                true,
            );
        });
        it('can manage member profiles', () => {
            expect(ability.can('manage', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('cannot manage other members from another organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: 'notmine',
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage private dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage private saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage private space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(true);
        });
    });

    describe('when user is an editor', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_EDITOR);
        });
        it('cannot manage organizations', () => {
            expect(ability.can('manage', 'Organization')).toEqual(false);
        });
        it('cannot view and manage private dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage public dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot view and manage private saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage public saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot view and manage private space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage public space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('can manage public dashboards from their own organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: '456',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot manage public dashboards from another organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: '789',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invite links', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(false);
        });
        it('cannot run SQL Queries', () => {
            expect(ability.can('manage', 'SqlRunner')).toEqual(false);
        });
    });
    describe('when user is an developer', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(
                ORGANIZATION_DEVELOPER,
            );
        });

        it('can run SQL Queries', () => {
            expect(ability.can('manage', 'SqlRunner')).toEqual(true);
        });
    });
    describe('when user is a member', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_MEMBER);
        });
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invitations', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(false);
        });
        it('cannot view organizations', () => {
            expect(ability.can('view', 'Organization')).toEqual(false);
        });
        it('cannot view charts', () => {
            expect(ability.can('view', 'SavedChart')).toEqual(false);
        });
    });
    describe('when user is a viewer', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_VIEWER);
        });
        it('cannot view and manage private dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view but can not manage public dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot view and manage private saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view but can not  manage public saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot view and manage private space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view but can not  manage public space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invitations', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(false);
        });
        it('cannot create Project', () => {
            const org = { organizationUuid: '456' };

            expect(ability.can('create', subject('Project', org))).toEqual(
                false,
            );
        });
        it('cannot create any resource', () => {
            expect(
                ability.can('create', subject('Space', { isPrivate: false })),
            ).toEqual(false);
            expect(
                ability.can('create', subject('Space', { isPrivate: true })),
            ).toEqual(false);
            expect(
                ability.can('create', subject('Space', { access: [] })),
            ).toEqual(true);

            expect(ability.can('create', 'Space')).toEqual(false);
            expect(ability.can('create', 'Dashboard')).toEqual(false);
            expect(ability.can('create', 'SavedChart')).toEqual(false);
            expect(ability.can('create', 'Organization')).toEqual(false);
        });
        it('cannot run SQL queries', () => {
            expect(ability.can('manage', 'SqlRunner')).toEqual(false);
        });
        it('cannot update any resource', () => {
            expect(ability.can('update', 'Space')).toEqual(false);
            expect(ability.can('update', 'Dashboard')).toEqual(false);
            expect(ability.can('update', 'SavedChart')).toEqual(false);
            expect(ability.can('update', 'Project')).toEqual(false);
            expect(ability.can('update', 'Organization')).toEqual(false);
            expect(ability.can('update', 'InviteLink')).toEqual(false);
        });
        it('cannot delete any resource', () => {
            expect(ability.can('delete', 'Space')).toEqual(false);
            expect(ability.can('delete', 'Dashboard')).toEqual(false);
            expect(ability.can('delete', 'SavedChart')).toEqual(false);
            expect(ability.can('delete', 'Project')).toEqual(false);
            expect(ability.can('delete', 'Organization')).toEqual(false);
            expect(ability.can('delete', 'InviteLink')).toEqual(false);
        });
        it('can view their own organization', () => {
            const org = { organizationUuid: '456' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                true,
            );
        });
        it('cannot view another organization', () => {
            const org = { organizationUuid: '789' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                false,
            );
        });

        it('can view dashboards from their own organization', () => {
            const org = { organizationUuid: '456', isPrivate: false };
            expect(ability.can('view', subject('Dashboard', org))).toEqual(
                true,
            );
        });
        it('cannot view dashboards from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { organizationUuid: '789' }),
                ),
            ).toEqual(false);
        });
        it('can view savedCharts from their own organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: '456',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot view savedCharts from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: '789',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view projects from their own organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Project', { organizationUuid: '456' }),
                ),
            ).toEqual(true);
        });
        it('cannot view projects from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Project', { organizationUuid: '789' }),
                ),
            ).toEqual(false);
        });
        it('can view their own jobs', () => {
            expect(
                ability.can(
                    'view',
                    subject('Job', { userUuid: ORGANIZATION_VIEWER.userUuid }),
                ),
            ).toEqual(false);
        });
        it('cannot view jobs from another user', () => {
            expect(
                ability.can(
                    'view',
                    subject('Job', { userUuid: 'another-user-uuid' }),
                ),
            ).toEqual(false);
        });
    });
    describe('when user is an interactive viewer', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(
                ORGANIZATION_INTERACTIVE_VIEWER,
            );
        });
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invitations', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(false);
        });
        it('can create Project', () => {
            expect(ability.can('create', 'Job')).toEqual(true);
            const org = { organizationUuid: '456' };
            expect(ability.can('create', subject('Project', org))).toEqual(
                true,
            );
        });

        it('cannot create any resource', () => {
            expect(ability.can('create', 'Space')).toEqual(false);
            expect(ability.can('create', 'Dashboard')).toEqual(false);
            expect(ability.can('create', 'SavedChart')).toEqual(false);
            expect(ability.can('create', 'Organization')).toEqual(false);
        });
        it('cannot run SQL queries', () => {
            expect(ability.can('manage', 'SqlRunner')).toEqual(false);
        });
        it('cannot update any resource', () => {
            expect(ability.can('update', 'Space')).toEqual(false);
            expect(ability.can('update', 'Dashboard')).toEqual(false);
            expect(ability.can('update', 'SavedChart')).toEqual(false);
            expect(ability.can('update', 'Project')).toEqual(false);
            expect(ability.can('update', 'Organization')).toEqual(false);
            expect(ability.can('update', 'InviteLink')).toEqual(false);
        });
        it('cannot delete any resource', () => {
            expect(ability.can('delete', 'Space')).toEqual(false);
            expect(ability.can('delete', 'Dashboard')).toEqual(false);
            expect(ability.can('delete', 'SavedChart')).toEqual(false);
            expect(ability.can('delete', 'Project')).toEqual(false);
            expect(ability.can('delete', 'Organization')).toEqual(false);
            expect(ability.can('delete', 'InviteLink')).toEqual(false);
        });
        it('can view their own organization', () => {
            const org = { organizationUuid: '456' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                true,
            );
        });
        it('cannot view another organization', () => {
            const org = { organizationUuid: '789' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                false,
            );
        });

        it('can view dashboards from their own organization', () => {
            const org = { organizationUuid: '456', isPrivate: false };
            expect(ability.can('view', subject('Dashboard', org))).toEqual(
                true,
            );
        });
        it('cannot view dashboards from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: '789',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view savedCharts from their own organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: '456',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot view savedCharts from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: '789',
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
        });
        it('can view projects from their own organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Project', { organizationUuid: '456' }),
                ),
            ).toEqual(true);
        });
        it('cannot view projects from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('Project', { organizationUuid: '789' }),
                ),
            ).toEqual(false);
        });
        it('can view their own jobs', () => {
            expect(
                ability.can(
                    'view',
                    subject('Job', {
                        userUuid: ORGANIZATION_INTERACTIVE_VIEWER.userUuid,
                    }),
                ),
            ).toEqual(true);
        });
        it('cannot view jobs from another user', () => {
            expect(
                ability.can(
                    'view',
                    subject('Job', { userUuid: 'another-user-uuid' }),
                ),
            ).toEqual(false);
        });
    });
});
