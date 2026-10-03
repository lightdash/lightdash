import { Ability, AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getProjectSettingsAccess } from './projectSettingsAccess';

const project = { organizationUuid: 'org', projectUuid: 'copy' };

const abilityWith = (rules: [string, string][]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    rules.forEach(([action, subject]) =>
        builder.can(action as never, subject as never, project),
    );
    return builder.build();
};

const access = (
    overrides: Partial<Parameters<typeof getProjectSettingsAccess>[0]> = {},
) =>
    getProjectSettingsAccess({
        ability: abilityWith([]),
        project,
        isTrainingCopy: false,
        isSoftDeleteEnabled: false,
        canCreateContentInAnySpace: false,
        ...overrides,
    });

const noAccess = { type: 'none', defaultPage: null };

describe('getProjectSettingsAccess', () => {
    it('opens Recently deleted to a member who can create content in a space', () => {
        expect(
            access({
                isSoftDeleteEnabled: true,
                canCreateContentInAnySpace: true,
            }),
        ).toEqual({
            type: 'limited',
            pages: ['recentlyDeleted'],
            defaultPage: 'recentlyDeleted',
        });
    });

    it('opens Recently deleted to a project-scoped content restorer without create access', () => {
        expect(
            access({
                ability: abilityWith([['manage', 'DeletedContent']]),
                isSoftDeleteEnabled: true,
            }),
        ).toEqual({
            type: 'limited',
            pages: ['recentlyDeleted'],
            defaultPage: 'recentlyDeleted',
        });
    });

    it.each([false, true])(
        'keeps full settings for a user who can update the project (soft delete: %s)',
        (isSoftDeleteEnabled) => {
            expect(
                access({
                    ability: abilityWith([
                        ['update', 'Project'],
                        ['manage', 'Validation'],
                    ]),
                    isTrainingCopy: true,
                    isSoftDeleteEnabled,
                    canCreateContentInAnySpace: true,
                }),
            ).toEqual({ type: 'full', defaultPage: 'settings' });
        },
    );

    it.each([false, true])(
        'keeps the Validator as the training-copy default (soft delete: %s)',
        (isSoftDeleteEnabled) => {
            expect(
                access({
                    ability: abilityWith([
                        ['manage', 'Validation'],
                        ['manage', 'DeletedContent'],
                    ]),
                    isTrainingCopy: true,
                    isSoftDeleteEnabled,
                }),
            ).toEqual({
                type: 'limited',
                pages: isSoftDeleteEnabled
                    ? ['validator', 'recentlyDeleted']
                    : ['validator'],
                defaultPage: 'validator',
            });
        },
    );

    it('opens nothing on a real project with only manage:Validation', () => {
        expect(
            access({
                ability: abilityWith([['manage', 'Validation']]),
                isSoftDeleteEnabled: true,
            }),
        ).toEqual(noAccess);
    });

    it.each([false, true])(
        'opens no project settings for a Viewer (training copy: %s)',
        (isTrainingCopy) => {
            expect(
                access({
                    ability: abilityWith([['view', 'Project']]),
                    isTrainingCopy,
                    isSoftDeleteEnabled: true,
                }),
            ).toEqual(noAccess);
        },
    );

    it.each([false, true])(
        'opens nothing with soft delete off (can create content: %s)',
        (canCreateContentInAnySpace) => {
            expect(
                access({
                    ability: abilityWith([['manage', 'DeletedContent']]),
                    canCreateContentInAnySpace,
                }),
            ).toEqual(noAccess);
        },
    );

    it.each([
        { organizationUuid: 'org', projectUuid: 'another-project' },
        { organizationUuid: 'another-org', projectUuid: 'copy' },
    ])(
        'does not borrow settings permissions from another scope (%j)',
        (otherProject) => {
            expect(
                access({
                    ability: abilityWith([
                        ['update', 'Project'],
                        ['manage', 'DeletedContent'],
                        ['manage', 'Validation'],
                    ]),
                    project: otherProject,
                    isTrainingCopy: true,
                    isSoftDeleteEnabled: true,
                }),
            ).toEqual(noAccess);
        },
    );
});
