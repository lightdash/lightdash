import {
    defineUserAbility,
    OrganizationMemberRole,
    SpaceMemberRole,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanManageDirectAccess } from './useCanManageDirectAccess';

vi.mock('../../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({ data: [] }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { userUuid: 'user', organizationUuid: 'org' } },
    }),
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () =>
        defineUserAbility(
            {
                role: OrganizationMemberRole.INTERACTIVE_VIEWER,
                organizationUuid: 'org',
                userUuid: 'user',
                roleUuid: undefined,
            },
            [],
        ),
}));

describe('personal app sharing controls', () => {
    it.each([
        { role: SpaceMemberRole.VIEWER, expected: false },
        { role: SpaceMemberRole.EDITOR, expected: false },
        { role: SpaceMemberRole.ADMIN, expected: true },
    ])(
        'exposes policy management for direct $role: $expected',
        ({ role, expected }) => {
            const { result } = renderHook(() =>
                useCanManageDirectAccess({
                    projectUuid: 'project',
                    spaceUuid: null,
                    createdByUserUuid: 'creator',
                    access: [],
                    grantRoles: [role],
                }),
            );
            expect(result.current).toBe(expected);
        },
    );

    it('preserves creator authority without a direct grant', () => {
        const { result } = renderHook(() =>
            useCanManageDirectAccess({
                projectUuid: 'project',
                spaceUuid: null,
                createdByUserUuid: 'user',
                access: [],
                grantRoles: [],
            }),
        );
        expect(result.current).toBe(true);
    });
});
