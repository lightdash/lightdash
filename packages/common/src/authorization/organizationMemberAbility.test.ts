import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { type OrganizationMemberProfile } from '../types/organizationMemberProfile';
import { SpaceMemberRole } from '../types/space';
import { organizationMemberAbilities } from './organizationMemberAbility';
import {
    ORGANIZATION_ADMIN,
    ORGANIZATION_DEVELOPER,
    ORGANIZATION_EDITOR,
    ORGANIZATION_INTERACTIVE_VIEWER,
    ORGANIZATION_MEMBER,
    ORGANIZATION_VIEWER,
} from './organizationMemberAbility.mock';
import { type MemberAbility } from './types';

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
        it('can view and manage all kinds of dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage all kinds of saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage all kinds of space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_ADMIN.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
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

        it('can view and manage public & accessable dashboards', () => {
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
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage public & accessable saved charts', () => {
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
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
        });
        it('can create a space', () => {
            expect(
                ability.can(
                    'create',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                    }),
                ),
            ).toEqual(true);
        });
        it('can view and manage public & accessable space', () => {
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
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_EDITOR.userUuid,
                                role: SpaceMemberRole.ADMIN,
                            },
                        ],
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
                        access: [],
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot manage public dashboards from another organization', () => {
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: '789',
                        isPrivate: false,
                        access: [],
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
        it('can only view public & accessable dashboards', () => {
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage public & accessable saved charts', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
        });
        it('can view and manage public & accessable space', () => {
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: false,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                        isPrivate: true,
                        access: [
                            {
                                userUuid: ORGANIZATION_VIEWER.userUuid,
                                role: SpaceMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).toEqual(false);
        });
        it('can view member profiles', () => {
            expect(
                ability.can(
                    'view',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(true);
        });
        it('can create invitations', () => {
            expect(ability.can('create', subject('InviteLink', {}))).toEqual(
                false,
            );
        });
        it('cannot create Project', () => {
            const org = { organizationUuid: '456' };

            expect(ability.can('create', subject('Project', org))).toEqual(
                false,
            );
        });
        it('cannot create any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'create',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('Organization', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot run SQL queries', () => {
            expect(ability.can('manage', subject('SqlRunner', {}))).toEqual(
                false,
            );
        });
        it('cannot update any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'update',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Project', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Organization', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('InviteLink', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot delete any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'delete',
                    subject('Space', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('SavedChart', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Project', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Organization', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('InviteLink', {
                        organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
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
            expect(
                ability.can(
                    'view',
                    subject('OrganizationMemberProfile', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(true);
        });
        it('can create invitations', () => {
            expect(ability.can('create', subject('InviteLink', {}))).toEqual(
                false,
            );
        });
        it('can create Project', () => {
            expect(ability.can('create', subject('Job', {}))).toEqual(true);
            const org = { organizationUuid: '456' };
            expect(ability.can('create', subject('Project', org))).toEqual(
                true,
            );
        });

        it('cannot create any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'create',
                    subject('Space', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('Dashboard', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('SavedChart', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'create',
                    subject('Organization', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot run SQL queries', () => {
            expect(
                ability.can(
                    'manage',
                    subject('SqlRunner', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot update any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'update',
                    subject('Space', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Dashboard', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('SavedChart', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Project', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('Organization', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'update',
                    subject('InviteLink', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot delete any resource, except space when have editor space role', () => {
            expect(
                ability.can(
                    'delete',
                    subject('Space', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('SavedChart', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Project', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('Organization', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'delete',
                    subject('InviteLink', {
                        organizationUuid:
                            ORGANIZATION_INTERACTIVE_VIEWER.organizationUuid,
                    }),
                ),
            ).toEqual(false);
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
