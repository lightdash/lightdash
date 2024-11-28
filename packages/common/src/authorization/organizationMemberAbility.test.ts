import { Ability, AbilityBuilder, subject } from '@casl/ability';
import {
    OrganizationMemberRole,
    type OrganizationMemberProfile,
} from '../types/organizationMemberProfile';
import { ProjectType } from '../types/projects';
import { SpaceMemberRole } from '../types/space';
import applyOrganizationMemberAbilities from './organizationMemberAbility';
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
    permissionsConfig?: {
        pat: {
            enabled: boolean;
            allowedOrgRoles: OrganizationMemberRole[];
        };
    },
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (member) {
        applyOrganizationMemberAbilities({
            role: member.role,
            member,
            builder,
            permissionsConfig: permissionsConfig ?? {
                pat: {
                    enabled: true,
                    allowedOrgRoles: Object.values(OrganizationMemberRole),
                },
            },
        });
    }
    return builder.build();
};

describe('Organization member permissions', () => {
    describe('Member permissions', () => {
        let ability = defineAbilityForOrganizationMember(ORGANIZATION_VIEWER);
        describe('when user is an organization admin', () => {
            beforeEach(() => {
                ability =
                    defineAbilityForOrganizationMember(ORGANIZATION_ADMIN);
            });

            it('can manage organizations', () => {
                expect(ability.can('manage', 'Organization')).toEqual(true);
            });

            it('cannot manage another organization', () => {
                const org = { organizationUuid: '789' };
                expect(
                    ability.can('manage', subject('Organization', org)),
                ).toEqual(false);
            });

            it('can manage their own organization', () => {
                const org = { organizationUuid: '456' };
                expect(
                    ability.can('manage', subject('Organization', org)),
                ).toEqual(true);
            });

            it('can manage member profiles', () => {
                expect(
                    ability.can('manage', 'OrganizationMemberProfile'),
                ).toEqual(true);
            });

            it('cannot manage other members from another organization', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('OrganizationMemberProfile', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_ADMIN.organizationUuid,
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
                ability =
                    defineAbilityForOrganizationMember(ORGANIZATION_EDITOR);
            });

            it('cannot manage organizations', () => {
                expect(ability.can('manage', 'Organization')).toEqual(false);
            });

            it('can view and manage public & accessable dashboards', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                        }),
                    ),
                ).toEqual(true);
            });

            it('can view and manage public & accessable space', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_EDITOR.organizationUuid,
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
                expect(
                    ability.can('view', 'OrganizationMemberProfile'),
                ).toEqual(true);
            });

            it('can create invite links', () => {
                expect(ability.can('create', 'InviteLink')).toEqual(false);
            });

            it('cannot run SQL Queries', () => {
                expect(ability.can('manage', 'SqlRunner')).toEqual(false);
            });

            it('can use the SemanticViewer', () => {
                expect(ability.can('manage', 'SemanticViewer')).toEqual(true);
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

            it('can use the SemanticViewer', () => {
                expect(ability.can('manage', 'SemanticViewer')).toEqual(true);
            });
        });

        describe('when user is a member', () => {
            beforeEach(() => {
                ability =
                    defineAbilityForOrganizationMember(ORGANIZATION_MEMBER);
            });

            it('can view member profiles', () => {
                expect(
                    ability.can('view', 'OrganizationMemberProfile'),
                ).toEqual(true);
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
                ability =
                    defineAbilityForOrganizationMember(ORGANIZATION_VIEWER);
            });

            it('can only view public & accessable dashboards', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(true);
            });

            it('can create invitations', () => {
                expect(
                    ability.can('create', subject('InviteLink', {})),
                ).toEqual(false);
            });

            it('cannot create a project in organization they belong to', () => {
                const check = {
                    organizationUuid: ORGANIZATION_VIEWER.organizationUuid,
                };

                expect(
                    ability.can('create', subject('Project', check)),
                ).toEqual(false);
            });

            it('cannot create any resource, except space when have editor space role', () => {
                expect(
                    ability.can(
                        'create',
                        subject('Space', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'create',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'create',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'create',
                        subject('Organization', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'update',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'update',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'update',
                        subject('Project', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'update',
                        subject('Organization', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'update',
                        subject('InviteLink', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
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
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'delete',
                        subject('Dashboard', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'delete',
                        subject('SavedChart', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'delete',
                        subject('Organization', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'delete',
                        subject('InviteLink', {
                            organizationUuid:
                                ORGANIZATION_VIEWER.organizationUuid,
                        }),
                    ),
                ).toEqual(false);
            });

            it('can view their own organization', () => {
                const org = { organizationUuid: '456' };
                expect(
                    ability.can('view', subject('Organization', org)),
                ).toEqual(true);
            });

            it('cannot view another organization', () => {
                const org = { organizationUuid: '789' };
                expect(
                    ability.can('view', subject('Organization', org)),
                ).toEqual(false);
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
                        subject('Job', {
                            userUuid: ORGANIZATION_VIEWER.userUuid,
                        }),
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

            it('cannot view the SemanticViewer', () => {
                expect(ability.can('view', 'SemanticViewer')).toEqual(false);
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
                expect(
                    ability.can('create', subject('InviteLink', {})),
                ).toEqual(false);
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

            it('cannot use the SemanticViewer', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', {
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
                expect(
                    ability.can('view', subject('Organization', org)),
                ).toEqual(true);
            });

            it('cannot view another organization', () => {
                const org = { organizationUuid: '789' };
                expect(
                    ability.can('view', subject('Organization', org)),
                ).toEqual(false);
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

    describe('Project creation permissions', () => {
        [
            {
                membership: ORGANIZATION_ADMIN,

                canCreateProject: true,
                canCreatePreview: true,

                canDeleteProject: true,
                canDeletePreview: true,
            },
            {
                membership: ORGANIZATION_DEVELOPER,
                canCreateProject: false,
                canCreatePreview: true,

                canDeleteProject: false,
                canDeletePreview: true,
            },
            {
                membership: ORGANIZATION_MEMBER,
                canCreateProject: false,
                canCreatePreview: false,

                canDeleteProject: false,
                canDeletePreview: false,
            },
            {
                membership: ORGANIZATION_VIEWER,
                canCreateProject: false,
                canCreatePreview: false,

                canDeleteProject: false,
                canDeletePreview: false,
            },
            {
                membership: ORGANIZATION_INTERACTIVE_VIEWER,
                canCreateProject: false,
                canCreatePreview: false,

                canDeleteProject: false,
                canDeletePreview: false,
            },
            {
                membership: ORGANIZATION_EDITOR,
                canCreateProject: false,
                canCreatePreview: false,

                canDeleteProject: false,
                canDeletePreview: false,
            },
        ].forEach(
            ({
                membership,
                canCreateProject,
                canCreatePreview,
                canDeleteProject,
                canDeletePreview,
            }) => {
                const ability = defineAbilityForOrganizationMember(membership);

                describe(`user is '${membership.role}' role`, () => {
                    it('checks if users can create project in organization they belong to', () => {
                        expect(
                            ability.can(
                                'create',
                                subject('Project', {
                                    organizationUuid:
                                        membership.organizationUuid,
                                    type: ProjectType.DEFAULT,
                                }),
                            ),
                        ).toEqual(canCreateProject);
                    });

                    it('checks that users cannot create a project in another organization', () => {
                        expect(
                            ability.can(
                                'create',
                                subject('Project', {
                                    organizationUuid: '789',
                                    type: ProjectType.DEFAULT,
                                }),
                            ),
                        ).toEqual(false);
                    });

                    it('checks if users can create a PREVIEW project in organization they belong to', () => {
                        expect(
                            ability.can(
                                'create',
                                subject('Project', {
                                    organizationUuid:
                                        membership.organizationUuid,
                                    type: ProjectType.PREVIEW,
                                }),
                            ),
                        ).toEqual(canCreatePreview);
                    });

                    it('checks that users cannot create a PREVIEW project in another organization', () => {
                        expect(
                            ability.can(
                                'create',
                                subject('Project', {
                                    organizationUuid: '789',
                                    type: ProjectType.PREVIEW,
                                }),
                            ),
                        ).toEqual(false);
                    });

                    it('checks if users can delete a project in organization they belong to', () => {
                        expect(
                            ability.can(
                                'delete',
                                subject('Project', {
                                    organizationUuid:
                                        membership.organizationUuid,
                                }),
                            ),
                        ).toEqual(canDeleteProject);
                    });

                    it('checks that users cannot delete a project in another organization', () => {
                        expect(
                            ability.can(
                                'delete',
                                subject('Project', {
                                    organizationUuid: '789',
                                }),
                            ),
                        ).toEqual(false);
                    });

                    it('checks if users can delete a PREVIEW project in organization they belong to', () => {
                        expect(
                            ability.can(
                                'delete',
                                subject('Project', {
                                    organizationUuid:
                                        membership.organizationUuid,
                                    type: ProjectType.PREVIEW,
                                }),
                            ),
                        ).toEqual(canDeletePreview);
                    });

                    it('checks that users cannot delete a PREVIEW project in another organization', () => {
                        expect(
                            ability.can(
                                'delete',
                                subject('Project', {
                                    organizationUuid: '789',
                                    type: ProjectType.PREVIEW,
                                }),
                            ),
                        ).toEqual(false);
                    });
                });
            },
        );
    });

    // test permissionsConfig
    describe('Personal Access Tokens permissions', () => {
        it('cannot create a personal access token as PAT is disabled', () => {
            const ability = defineAbilityForOrganizationMember(
                ORGANIZATION_ADMIN,
                {
                    pat: {
                        enabled: false,
                        allowedOrgRoles: Object.values(OrganizationMemberRole),
                    },
                },
            );

            expect(
                ability.can(
                    'create',
                    subject('PersonalAccessToken', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        userUuid: ORGANIZATION_ADMIN.userUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('cannot create a personal access token as PAT allowed roles dont match', () => {
            const ability = defineAbilityForOrganizationMember(
                ORGANIZATION_DEVELOPER,
                {
                    pat: {
                        enabled: true,
                        allowedOrgRoles: [OrganizationMemberRole.ADMIN],
                    },
                },
            );

            expect(
                ability.can(
                    'create',
                    subject('PersonalAccessToken', {
                        organizationUuid:
                            ORGANIZATION_DEVELOPER.organizationUuid,
                        userUuid: ORGANIZATION_DEVELOPER.userUuid,
                    }),
                ),
            ).toEqual(false);
        });
        it('can create a personal access token as PAT is enabled', () => {
            const ability = defineAbilityForOrganizationMember(
                ORGANIZATION_ADMIN,
                {
                    pat: {
                        enabled: true,
                        allowedOrgRoles: [OrganizationMemberRole.ADMIN],
                    },
                },
            );

            expect(
                ability.can(
                    'create',
                    subject('PersonalAccessToken', {
                        organizationUuid: ORGANIZATION_ADMIN.organizationUuid,
                        userUuid: ORGANIZATION_ADMIN.userUuid,
                    }),
                ),
            ).toEqual(true);
        });
    });
});
