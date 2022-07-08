import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { Organization } from '../types/organization';
import { OrganizationMemberProfile } from '../types/organizationMemberProfile';
import { organizationMemberAbilities } from './organizationMemberAbility';
import {
    ORGANIZATION_ADMIN,
    ORGANIZATION_EDITOR,
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
            const org: Organization = { organizationUuid: '789' };
            expect(ability.can('manage', subject('Organization', org))).toEqual(
                false,
            );
        });
        it('can manage their own organization', () => {
            const org: Organization = { organizationUuid: '456' };
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
    });

    describe('when user is an editor', () => {
        beforeEach(() => {
            ability = defineAbilityForOrganizationMember(ORGANIZATION_EDITOR);
        });
        it('cannot manage organizations', () => {
            expect(ability.can('manage', 'Organization')).toEqual(false);
        });
        it('can view dashboards', () => {
            expect(ability.can('view', 'Dashboard')).toEqual(true);
        });
        it('cannot manage dashboards from their own organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { organizationUuid: '456' }),
                ),
            ).toEqual(true);
        });
        it('cannot manage dashboards from another organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { organizationUuid: '789' }),
                ),
            ).toEqual(false);
        });
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invite links', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(true);
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
            expect(ability.can('create', 'InviteLink')).toEqual(true);
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
        it('can view member profiles', () => {
            expect(ability.can('view', 'OrganizationMemberProfile')).toEqual(
                true,
            );
        });
        it('can create invitations', () => {
            expect(ability.can('create', 'InviteLink')).toEqual(true);
        });
        it('can create Project', () => {
            expect(ability.can('create', 'Project')).toEqual(true);
        });
        it('cannot create any resource', () => {
            expect(ability.can('create', 'Dashboard')).toEqual(false);
            expect(ability.can('create', 'SavedChart')).toEqual(false);
            expect(ability.can('create', 'Organization')).toEqual(false);
        });
        it('cannot run SQL queries', () => {
            expect(ability.can('manage', 'SqlRunner')).toEqual(false);
        });
        it('cannot update any resource', () => {
            expect(ability.can('update', 'Dashboard')).toEqual(false);
            expect(ability.can('update', 'SavedChart')).toEqual(false);
            expect(ability.can('update', 'Project')).toEqual(false);
            expect(ability.can('update', 'Organization')).toEqual(false);
            expect(ability.can('update', 'InviteLink')).toEqual(false);
        });
        it('cannot delete any resource', () => {
            expect(ability.can('delete', 'Dashboard')).toEqual(false);
            expect(ability.can('delete', 'SavedChart')).toEqual(false);
            expect(ability.can('delete', 'Project')).toEqual(false);
            expect(ability.can('delete', 'Organization')).toEqual(false);
            expect(ability.can('delete', 'InviteLink')).toEqual(false);
        });
        it('can view their own organization', () => {
            const org: Organization = { organizationUuid: '456' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                true,
            );
        });
        it('cannot view another organization', () => {
            const org: Organization = { organizationUuid: '789' };
            expect(ability.can('view', subject('Organization', org))).toEqual(
                false,
            );
        });

        it('can view dashboards from their own organization', () => {
            const org: Organization = { organizationUuid: '456' };
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
                    subject('SavedChart', { organizationUuid: '456' }),
                ),
            ).toEqual(true);
        });
        it('cannot view savedCharts from another organization', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { organizationUuid: '789' }),
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
