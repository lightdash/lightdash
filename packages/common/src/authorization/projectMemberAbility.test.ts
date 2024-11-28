import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { ProjectType } from '../types/projects';
import { SpaceMemberRole } from '../types/space';
import { projectMemberAbilities } from './projectMemberAbility';
import {
    PROJECT_ADMIN,
    PROJECT_DEVELOPER,
    PROJECT_EDITOR,
    PROJECT_INTERACTIVE_VIEWER,
    PROJECT_VIEWER,
} from './projectMemberAbility.mock';
import { type MemberAbility } from './types';

const { projectUuid } = PROJECT_VIEWER;

const defineAbilityForProjectMember = (
    member:
        | Pick<ProjectMemberProfile, 'role' | 'projectUuid' | 'userUuid'>
        | undefined,
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (member) {
        projectMemberAbilities[member.role](member, builder);
    }
    return builder.build();
};

describe('Project member permissions', () => {
    describe('Member permissions', () => {
        let ability = defineAbilityForProjectMember(PROJECT_ADMIN);
        describe('when user is an project admin', () => {
            beforeEach(() => {
                ability = defineAbilityForProjectMember(PROJECT_ADMIN);
            });

            it('can view and manage all kinds of dashboards', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_ADMIN.userUuid,
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toEqual(true);
            });

            it('can manage other types of public resources', () => {
                expect(
                    ability.can('manage', subject('Project', { projectUuid })),
                ).toEqual(true);
                expect(
                    ability.can('manage', subject('Job', { projectUuid })),
                ).toEqual(true);
            });

            it('cannot view resources from another projectUuid', () => {
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Project', { projectUuid: '5678' }),
                    ),
                ).toEqual(false);
            });
        });

        describe('when user is an editor', () => {
            beforeEach(() => {
                ability = defineAbilityForProjectMember(PROJECT_EDITOR);
            });

            it('can view and manage public & accessible dashboards', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid: PROJECT_EDITOR.projectUuid,
                        }),
                    ),
                ).toEqual(true);
            });
            it('can view and manage public & accessable space', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_EDITOR.userUuid,
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                        }),
                    ),
                ).toEqual(true);
            });

            it('can view other public resources', () => {
                expect(
                    ability.can('view', subject('Project', { projectUuid })),
                ).toEqual(true);
            });
            it('can manage other public resources', () => {
                expect(
                    ability.can('manage', subject('Job', { projectUuid })),
                ).toEqual(true);
            });
            it('cannot manage projects', () => {
                expect(
                    ability.can('manage', subject('Project', { projectUuid })),
                ).toEqual(false);
            });
            it('can download CSV', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('ExportCsv', { projectUuid }),
                    ),
                ).toEqual(true);
            });
            it('can change csv results', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('ChangeCsvResults', { projectUuid }),
                    ),
                ).toEqual(true);
            });

            it('cannot use SQL runner', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SqlRunner', { projectUuid }),
                    ),
                ).toEqual(false);
            });

            it('can use the SemanticViewer', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', { projectUuid }),
                    ),
                ).toEqual(true);
            });
        });

        describe('when user is an developer', () => {
            beforeEach(() => {
                ability = defineAbilityForProjectMember(PROJECT_DEVELOPER);
            });

            it('can use SQL runner', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SqlRunner', { projectUuid }),
                    ),
                ).toEqual(true);
            });

            it('can use the SemanticViewer', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', { projectUuid }),
                    ),
                ).toEqual(true);
            });
        });
        describe('when user is a viewer', () => {
            beforeEach(() => {
                ability = defineAbilityForProjectMember(PROJECT_VIEWER);
            });

            it('can only view public & accessable dashboards', () => {
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [],
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
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
                            projectUuid,
                            isPrivate: true,
                            access: [
                                {
                                    userUuid: PROJECT_VIEWER.userUuid,
                                    role: SpaceMemberRole.EDITOR,
                                },
                            ],
                        }),
                    ),
                ).toEqual(false);
            });

            it('can view other public resources', () => {
                expect(
                    ability.can('view', subject('Project', { projectUuid })),
                ).toEqual(true);
            });
            it('cannot view resources from another project', () => {
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Project', { projectUuid: '5678' }),
                    ),
                ).toEqual(false);
            });
            it('cannot manage resources', () => {
                expect(
                    ability.can('manage', subject('Project', { projectUuid })),
                ).toEqual(false);
                expect(
                    ability.can('manage', subject('Job', { projectUuid })),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SqlRunner', { projectUuid }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', { projectUuid }),
                    ),
                ).toEqual(false);
            });
            it('can download CSV', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('ExportCsv', { projectUuid }),
                    ),
                ).toEqual(true);
            });
            it('cannot change csv results', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('ChangeCsvResults', { projectUuid }),
                    ),
                ).toEqual(false);
            });
            it('cannot Explore', () => {
                expect(
                    ability.can('manage', subject('Explore', { projectUuid })),
                ).toEqual(false);
            });
            it('cannot view underlying data', () => {
                expect(
                    ability.can(
                        'view',
                        subject('UnderlyingData', { projectUuid }),
                    ),
                ).toEqual(false);
            });
        });

        describe('when user is a interactive viewer', () => {
            beforeEach(() => {
                ability = defineAbilityForProjectMember(
                    PROJECT_INTERACTIVE_VIEWER,
                );
            });

            it('can view public resources', () => {
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', { projectUuid, isPrivate: false }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('Space', { projectUuid, isPrivate: false }),
                    ),
                ).toEqual(true);
                expect(
                    ability.can('view', subject('Project', { projectUuid })),
                ).toEqual(true);
                expect(
                    ability.can(
                        'view',
                        subject('SemanticViewer', { projectUuid }),
                    ),
                ).toEqual(true);
            });
            it('can not view private resources', () => {
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
            });
            it('cannot view resources from another project', () => {
                expect(
                    ability.can(
                        'view',
                        subject('SavedChart', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Dashboard', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Space', {
                            projectUuid: '5678',
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'view',
                        subject('Project', { projectUuid: '5678' }),
                    ),
                ).toEqual(false);
            });
            it('cannot manage resources', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', {
                            projectUuid,
                            isPrivate: false,
                        }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', { projectUuid, isPrivate: false }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', { projectUuid, isPrivate: false }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SavedChart', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Dashboard', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('Space', { projectUuid, isPrivate: true }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can('manage', subject('Project', { projectUuid })),
                ).toEqual(false);
                expect(
                    ability.can('manage', subject('Job', { projectUuid })),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SqlRunner', { projectUuid }),
                    ),
                ).toEqual(false);
                expect(
                    ability.can(
                        'manage',
                        subject('SemanticViewer', { projectUuid }),
                    ),
                ).toEqual(false);
            });
            it('can download CSV', () => {
                expect(
                    ability.can(
                        'manage',
                        subject('ExportCsv', { projectUuid }),
                    ),
                ).toEqual(true);
            });
            it('can Explore', () => {
                expect(
                    ability.can('manage', subject('Explore', { projectUuid })),
                ).toEqual(true);
            });
            it('can view underlying data', () => {
                expect(
                    ability.can(
                        'view',
                        subject('UnderlyingData', { projectUuid }),
                    ),
                ).toEqual(true);
            });
        });
    });

    [
        {
            membership: PROJECT_ADMIN,
            canCreatePreview: true,
            canDeleteTheirOwnPreview: true,
        },
        {
            membership: PROJECT_DEVELOPER,
            canCreatePreview: true,
            canDeleteTheirOwnPreview: true,
        },
        {
            membership: PROJECT_EDITOR,
            canCreatePreview: false,
            canDeleteTheirOwnPreview: false,
        },
        {
            membership: PROJECT_INTERACTIVE_VIEWER,
            canCreatePreview: false,
            canDeleteTheirOwnPreview: false,
        },
        {
            membership: PROJECT_VIEWER,
            canCreatePreview: false,
            canDeleteTheirOwnPreview: false,
        },
    ].forEach(({ membership, canCreatePreview, canDeleteTheirOwnPreview }) => {
        describe('test project preview permissions', () => {
            const ability = defineAbilityForProjectMember(membership);

            it('checks if user can create PREVIEW projects', () => {
                expect(
                    ability.can(
                        'create',
                        subject('Project', {
                            upstreamProjectUuid: projectUuid,
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toEqual(canCreatePreview);
            });

            it('checks that users cannot create regular projects', () => {
                expect(
                    ability.can(
                        'create',
                        subject('Project', {
                            upstreamProjectUuid: projectUuid,
                            type: ProjectType.DEFAULT,
                        }),
                    ),
                ).toEqual(false);
            });

            it('checks if user can delete their own PREVIEW projects', () => {
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: membership.userUuid,
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toEqual(canDeleteTheirOwnPreview);
            });

            it('checks that users cannot delete other users PREVIEW projects', () => {
                expect(
                    ability.can(
                        'delete',
                        subject('Project', {
                            createdByUserUuid: '1234',
                            type: ProjectType.PREVIEW,
                        }),
                    ),
                ).toEqual(false);
            });
        });
    });
});
