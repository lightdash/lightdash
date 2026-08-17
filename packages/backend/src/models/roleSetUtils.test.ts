import {
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
} from '@lightdash/common';
import {
    joinRoleSet,
    normalizeRoleSet,
    ORGANIZATION_PLACEHOLDER_ROLE,
    PROJECT_PLACEHOLDER_ROLE,
    splitRoleSet,
} from './roleSetUtils';

describe('roleSetUtils', () => {
    describe('normalizeRoleSet', () => {
        it('dedupes custom roles keeping first occurrence order', () => {
            expect(
                normalizeRoleSet({
                    systemRole: null,
                    customRoleUuids: ['b', 'a', 'b', 'c', 'a'],
                }),
            ).toEqual({ systemRole: null, customRoleUuids: ['b', 'a', 'c'] });
        });

        it('rejects an empty set', () => {
            expect(() =>
                normalizeRoleSet({ systemRole: null, customRoleUuids: [] }),
            ).toThrow(ParameterError);
        });

        it('accepts a system-only set', () => {
            expect(
                normalizeRoleSet({
                    systemRole: OrganizationMemberRole.VIEWER,
                    customRoleUuids: [],
                }),
            ).toEqual({
                systemRole: OrganizationMemberRole.VIEWER,
                customRoleUuids: [],
            });
        });
    });

    describe('splitRoleSet', () => {
        it('puts the system role in the slot and all custom roles in extras', () => {
            expect(
                splitRoleSet(
                    {
                        systemRole: OrganizationMemberRole.EDITOR,
                        customRoleUuids: ['a', 'b'],
                    },
                    ORGANIZATION_PLACEHOLDER_ROLE,
                ),
            ).toEqual({
                slot: { role: OrganizationMemberRole.EDITOR, roleUuid: null },
                extraRoleUuids: ['a', 'b'],
            });
        });

        it('puts the first custom role in the slot with the placeholder when custom-only', () => {
            expect(
                splitRoleSet(
                    { systemRole: null, customRoleUuids: ['a', 'b'] },
                    PROJECT_PLACEHOLDER_ROLE,
                ),
            ).toEqual({
                slot: { role: ProjectMemberRole.VIEWER, roleUuid: 'a' },
                extraRoleUuids: ['b'],
            });
        });
    });

    describe('joinRoleSet', () => {
        it('reports the system role when the slot has no custom role', () => {
            expect(
                joinRoleSet(
                    { role: ProjectMemberRole.EDITOR, roleUuid: null },
                    ['x'],
                ),
            ).toEqual({
                systemRole: ProjectMemberRole.EDITOR,
                customRoleUuids: ['x'],
            });
        });

        it('never surfaces the placeholder as a system role', () => {
            expect(
                joinRoleSet({ role: ProjectMemberRole.VIEWER, roleUuid: 'a' }, [
                    'b',
                ]),
            ).toEqual({ systemRole: null, customRoleUuids: ['a', 'b'] });
        });

        it('round-trips split → join for every shape', () => {
            const shapes = [
                {
                    systemRole: OrganizationMemberRole.ADMIN,
                    customRoleUuids: [],
                },
                {
                    systemRole: OrganizationMemberRole.MEMBER,
                    customRoleUuids: ['a'],
                },
                { systemRole: null, customRoleUuids: ['a'] },
                { systemRole: null, customRoleUuids: ['a', 'b', 'c'] },
            ] as const;
            shapes.forEach((shape) => {
                const { slot, extraRoleUuids } = splitRoleSet(
                    { ...shape, customRoleUuids: [...shape.customRoleUuids] },
                    ORGANIZATION_PLACEHOLDER_ROLE,
                );
                expect(joinRoleSet(slot, extraRoleUuids)).toEqual({
                    systemRole: shape.systemRole,
                    customRoleUuids: [...shape.customRoleUuids],
                });
            });
        });
    });
});
