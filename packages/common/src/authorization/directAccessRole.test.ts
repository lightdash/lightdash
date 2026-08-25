import { describe, expect, it } from 'vitest';
import { SpaceMemberRole } from '../types/space';
import {
    canDelegateDirectAccessRole,
    resolveDirectAccessRole,
    type DirectAccessRoleInput,
} from './directAccessRole';

const roles = [
    SpaceMemberRole.VIEWER,
    SpaceMemberRole.EDITOR,
    SpaceMemberRole.ADMIN,
] as const;

const optionalRoles = [undefined, ...roles] as const;
const ceilings = [null, ...roles] as const;

const resolve = (
    input: Partial<DirectAccessRoleInput>,
): SpaceMemberRole | undefined =>
    resolveDirectAccessRole({
        logicalSpaceRole: undefined,
        directUserRole: undefined,
        directGroupRoles: [],
        capabilityCeiling: SpaceMemberRole.ADMIN,
        ...input,
    });

describe('resolveDirectAccessRole', () => {
    it.each([
        {
            name: 'keeps logical access when there are no direct grants',
            input: { logicalSpaceRole: SpaceMemberRole.EDITOR },
            expected: SpaceMemberRole.EDITOR,
        },
        {
            name: 'lets a direct user grant raise logical access',
            input: {
                logicalSpaceRole: SpaceMemberRole.VIEWER,
                directUserRole: SpaceMemberRole.EDITOR,
            },
            expected: SpaceMemberRole.EDITOR,
        },
        {
            name: 'lets a direct group grant raise logical and user access',
            input: {
                logicalSpaceRole: SpaceMemberRole.VIEWER,
                directUserRole: SpaceMemberRole.EDITOR,
                directGroupRoles: [SpaceMemberRole.ADMIN],
            },
            expected: SpaceMemberRole.ADMIN,
        },
        {
            name: 'does not let lower direct grants reduce logical access',
            input: {
                logicalSpaceRole: SpaceMemberRole.ADMIN,
                directUserRole: SpaceMemberRole.VIEWER,
                directGroupRoles: [SpaceMemberRole.EDITOR],
            },
            expected: SpaceMemberRole.ADMIN,
        },
        {
            name: 'applies the capability ceiling after additive resolution',
            input: {
                logicalSpaceRole: SpaceMemberRole.VIEWER,
                directUserRole: SpaceMemberRole.ADMIN,
                capabilityCeiling: SpaceMemberRole.EDITOR,
            },
            expected: SpaceMemberRole.EDITOR,
        },
        {
            name: 'returns no access when the principal has no capability',
            input: {
                directUserRole: SpaceMemberRole.ADMIN,
                capabilityCeiling: null,
            },
            expected: undefined,
        },
        {
            name: 'ignores inactive or missing grant sources',
            input: {
                directUserRole: undefined,
                directGroupRoles: [undefined, SpaceMemberRole.VIEWER],
            },
            expected: SpaceMemberRole.VIEWER,
        },
    ])('$name', ({ input, expected }) => {
        expect(resolve(input)).toBe(expected);
    });

    it('is unchanged when direct roles are reordered or duplicated', () => {
        expect(
            resolve({
                directGroupRoles: [
                    SpaceMemberRole.VIEWER,
                    SpaceMemberRole.ADMIN,
                    SpaceMemberRole.EDITOR,
                ],
            }),
        ).toBe(
            resolve({
                directGroupRoles: [
                    SpaceMemberRole.ADMIN,
                    SpaceMemberRole.VIEWER,
                    SpaceMemberRole.ADMIN,
                    SpaceMemberRole.EDITOR,
                ],
            }),
        );
    });

    it('never lets a direct role reduce the result', () => {
        for (const logicalSpaceRole of optionalRoles) {
            for (const directUserRole of optionalRoles) {
                for (const directGroupRole of optionalRoles) {
                    for (const capabilityCeiling of ceilings) {
                        const withoutDirectRole = resolve({
                            logicalSpaceRole,
                            capabilityCeiling,
                        });
                        const withDirectRole = resolve({
                            logicalSpaceRole,
                            directUserRole,
                            directGroupRoles: [directGroupRole],
                            capabilityCeiling,
                        });

                        if (
                            withoutDirectRole !== undefined &&
                            withDirectRole !== undefined
                        ) {
                            expect(
                                roles.indexOf(withDirectRole),
                            ).toBeGreaterThanOrEqual(
                                roles.indexOf(withoutDirectRole),
                            );
                        }
                    }
                }
            }
        }
    });

    it('never resolves above the capability ceiling', () => {
        for (const logicalSpaceRole of optionalRoles) {
            for (const directUserRole of optionalRoles) {
                for (const directGroupRole of optionalRoles) {
                    for (const capabilityCeiling of roles) {
                        const result = resolve({
                            logicalSpaceRole,
                            directUserRole,
                            directGroupRoles: [directGroupRole],
                            capabilityCeiling,
                        });

                        if (result !== undefined) {
                            expect(roles.indexOf(result)).toBeLessThanOrEqual(
                                roles.indexOf(capabilityCeiling),
                            );
                        }
                    }
                }
            }
        }
    });
});

describe('canDelegateDirectAccessRole', () => {
    it.each([
        [undefined, SpaceMemberRole.VIEWER, false],
        [SpaceMemberRole.VIEWER, SpaceMemberRole.VIEWER, false],
        [SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR, false],
        [SpaceMemberRole.VIEWER, SpaceMemberRole.ADMIN, false],
        [SpaceMemberRole.EDITOR, SpaceMemberRole.VIEWER, true],
        [SpaceMemberRole.EDITOR, SpaceMemberRole.EDITOR, true],
        [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN, false],
        [SpaceMemberRole.ADMIN, SpaceMemberRole.VIEWER, true],
        [SpaceMemberRole.ADMIN, SpaceMemberRole.EDITOR, true],
        [SpaceMemberRole.ADMIN, SpaceMemberRole.ADMIN, true],
    ])(
        'actor %s granting %s returns %s',
        (actorRole, requestedRole, expected) => {
            expect(canDelegateDirectAccessRole(actorRole, requestedRole)).toBe(
                expected,
            );
        },
    );
});
