import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ProjectMemberProfile } from '../types/projectMemberProfile';
import { projectMemberAbilities } from './projectMemberAbility';
import {
    PROJECT_ADMIN,
    PROJECT_EDITOR,
    PROJECT_VIEWER,
} from './projectMemberAbility.mock';
import { MemberAbility } from './types';

const { projectUuid } = PROJECT_VIEWER;

const defineAbilityForProjectMember = (
    member: Pick<ProjectMemberProfile, 'role' | 'projectUuid'> | undefined,
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

        it('can view resources', () => {
            expect(
                ability.can('view', subject('SavedChart', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { projectUuid })),
            ).toEqual(true);
        });
        it('can manage resources', () => {
            expect(
                ability.can('manage', subject('SavedChart', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Dashboard', { projectUuid })),
            ).toEqual(true);
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
                    subject('SavedChart', { projectUuid: '5678' }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { projectUuid: '5678' }),
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

        it('can view resources', () => {
            expect(
                ability.can('view', subject('SavedChart', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { projectUuid })),
            ).toEqual(true);
        });
        it('can manage resources', () => {
            expect(
                ability.can('manage', subject('SavedChart', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Dashboard', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Job', { projectUuid })),
            ).toEqual(true);
        });
        it('cannot manage projects', () => {
            expect(
                ability.can('manage', subject('Project', { projectUuid })),
            ).toEqual(false);
        });
    });

    describe('when user is a viewer', () => {
        beforeEach(() => {
            ability = defineAbilityForProjectMember(PROJECT_VIEWER);
        });

        it('can view resources', () => {
            expect(
                ability.can('view', subject('SavedChart', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { projectUuid })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { projectUuid })),
            ).toEqual(true);
        });
        it('cannot view resources from another project', () => {
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { projectUuid: '5678' }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { projectUuid: '5678' }),
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
                ability.can('manage', subject('SavedChart', { projectUuid })),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Dashboard', { projectUuid })),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Project', { projectUuid })),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Job', { projectUuid })),
            ).toEqual(false);
        });
    });
});
