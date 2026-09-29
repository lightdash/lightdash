import { Ability, AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getProjectSettingsAccess } from './projectSettingsAccess';

const project = { organizationUuid: 'org', projectUuid: 'copy' };

const abilityWith = (rules: [string, string][]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    rules.forEach(([action, subject]) =>
        builder.can(action as never, subject as never, {
            projectUuid: project.projectUuid,
        }),
    );
    return builder.build();
};

describe('getProjectSettingsAccess', () => {
    it('opens every tab to a user who can update the project', () => {
        expect(
            getProjectSettingsAccess({
                ability: abilityWith([
                    ['update', 'Project'],
                    ['manage', 'Validation'],
                ]),
                project,
                isTrainingCopy: true,
            }),
        ).toBe('full');
    });

    it('opens the Validator alone to a learner in their training copy', () => {
        expect(
            getProjectSettingsAccess({
                ability: abilityWith([['manage', 'Validation']]),
                project,
                isTrainingCopy: true,
            }),
        ).toBe('learnerCopy');
    });

    it('opens nothing on a real project without update:Project', () => {
        expect(
            getProjectSettingsAccess({
                ability: abilityWith([['manage', 'Validation']]),
                project,
                isTrainingCopy: false,
            }),
        ).toBe('none');
    });

    it('opens nothing in a training copy without manage:Validation', () => {
        expect(
            getProjectSettingsAccess({
                ability: abilityWith([['view', 'Project']]),
                project,
                isTrainingCopy: true,
            }),
        ).toBe('none');
    });
});
