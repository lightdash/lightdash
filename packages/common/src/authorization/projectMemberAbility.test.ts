import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ProjectMemberProfile } from '../types/projectMemberProfile';
import { projectMemberAbilities } from './projectMemberAbility';
import {
    PROJECT_ADMIN,
    PROJECT_DEVELOPER,
    PROJECT_EDITOR,
    PROJECT_INTERACTIVE_VIEWER,
    PROJECT_VIEWER,
} from './projectMemberAbility.mock';
import { MemberAbility } from './types';

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
    let ability = defineAbilityForProjectMember(PROJECT_ADMIN);
    describe('when user is an project admin', () => {
        beforeEach(() => {
            ability = defineAbilityForProjectMember(PROJECT_ADMIN);
        });

        it('can view public resources', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
        });
        it('can view private resources', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid, isPrivate: true }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { projectUuid, isPrivate: true }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Space', { projectUuid, isPrivate: true }),
                ),
            ).toEqual(true);
        });
        it('can manage public resources', () => {
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Project', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Job', { projectUuid })),
            ).toEqual(true);
        });
        it('can manage private resources', () => {
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { projectUuid, isPrivate: true }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { projectUuid, isPrivate: true }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', { projectUuid, isPrivate: true }),
                ),
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
                    subject('Space', { projectUuid: '5678', isPrivate: false }),
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

        it('can view public resources', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
        it('can manage public resources', () => {
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Space', { projectUuid, isPrivate: false }),
                ),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Job', { projectUuid })),
            ).toEqual(true);
        });
        it('can not manage private resources', () => {
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
        });
        it('cannot manage projects', () => {
            expect(
                ability.can('manage', subject('Project', { projectUuid })),
            ).toEqual(false);
        });
        it('can download CSV', () => {
            expect(
                ability.can('manage', subject('ExportCsv', { projectUuid })),
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
                ability.can('manage', subject('SqlRunner', { projectUuid })),
            ).toEqual(false);
        });
    });

    describe('when user is an editor', () => {
        beforeEach(() => {
            ability = defineAbilityForProjectMember(PROJECT_DEVELOPER);
        });

        it('can use SQL runner', () => {
            expect(
                ability.can('manage', subject('SqlRunner', { projectUuid })),
            ).toEqual(true);
        });
    });
    describe('when user is a viewer', () => {
        beforeEach(() => {
            ability = defineAbilityForProjectMember(PROJECT_VIEWER);
        });

        it('can view public resources', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
                    subject('Space', { projectUuid: '5678', isPrivate: false }),
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
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
                ability.can('manage', subject('SqlRunner', { projectUuid })),
            ).toEqual(false);
        });
        it('can download CSV', () => {
            expect(
                ability.can('manage', subject('ExportCsv', { projectUuid })),
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
                ability.can('view', subject('UnderlyingData', { projectUuid })),
            ).toEqual(false);
        });
    });

    describe('when user is a interactive viewer', () => {
        beforeEach(() => {
            ability = defineAbilityForProjectMember(PROJECT_INTERACTIVE_VIEWER);
        });

        it('can view public resources', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
                    subject('Space', { projectUuid: '5678', isPrivate: false }),
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
                    subject('SavedChart', { projectUuid, isPrivate: false }),
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
                ability.can('manage', subject('SqlRunner', { projectUuid })),
            ).toEqual(false);
        });
        it('can download CSV', () => {
            expect(
                ability.can('manage', subject('ExportCsv', { projectUuid })),
            ).toEqual(true);
        });
        it('can Explore', () => {
            expect(
                ability.can('manage', subject('Explore', { projectUuid })),
            ).toEqual(true);
        });
        it('can view underlying data', () => {
            expect(
                ability.can('view', subject('UnderlyingData', { projectUuid })),
            ).toEqual(true);
        });
    });
});
