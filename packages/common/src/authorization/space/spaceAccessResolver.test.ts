import { OrganizationMemberRole } from '../../types/organizationMemberProfile';
import { ProjectMemberRole } from '../../types/projectMemberRole';
import {
    DirectSpaceAccessOrigin,
    ProjectSpaceAccessOrigin,
    SpaceMemberRole,
    type DirectSpaceAccess,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SpaceAccessInput,
} from '../../types/space';
import {
    resolveSpaceAccess,
    resolveSpaceAccessWithInheritance,
} from './spaceAccessResolver';

const makeInput = (
    overrides: Partial<SpaceAccessInput> = {},
): SpaceAccessInput => ({
    spaceUuid: 'space-1',
    inheritParentPermissions: true,
    directAccess: [],
    projectAccess: [],
    organizationAccess: [],
    ...overrides,
});

describe('resolveSpaceAccess', () => {
    it('returns empty array for empty inputs', () => {
        const result = resolveSpaceAccess(makeInput());
        expect(result).toEqual([]);
    });

    describe('admin override', () => {
        it('org admin gets space ADMIN', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.ADMIN,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
            expect(result[0].inheritedFrom).toBe('organization');
        });

        it('project admin gets space ADMIN', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.ADMIN,
                            from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        it('group admin (project group) gets space ADMIN', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.ADMIN,
                            from: ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        it('admin can access private space even without direct access', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: false,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.ADMIN,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });
    });

    describe('direct access', () => {
        it('USER_ACCESS role used directly', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    directAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.EDITOR,
                            from: DirectSpaceAccessOrigin.USER_ACCESS,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('GROUP_ACCESS role used when no user role', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    directAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.EDITOR,
                            from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('user + group direct access: user role wins when higher', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    directAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.EDITOR,
                            from: DirectSpaceAccessOrigin.USER_ACCESS,
                        },
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.VIEWER,
                            from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            // User access takes precedence over group access
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('public space inheritance', () => {
        it('viewer gets viewer space role', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.VIEWER);
            expect(result[0].hasDirectAccess).toBe(false);
            expect(result[0].inheritedFrom).toBe('organization');
        });

        it('editor gets editor space role', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.EDITOR,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        it('developer gets editor space role', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.DEVELOPER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        it('interactive_viewer gets viewer space role', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.INTERACTIVE_VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.VIEWER);
        });
    });

    describe('private space exclusion', () => {
        it('non-admin without direct access excluded from private space', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: false,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.EDITOR,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(0);
        });

        it('private space with direct access works', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: false,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    directAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.EDITOR,
                            from: DirectSpaceAccessOrigin.USER_ACCESS,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('org MEMBER role', () => {
        it('org MEMBER with no other access is excluded', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.MEMBER,
                        },
                    ],
                }),
            );
            // MEMBER converts to undefined project role, so no highest role → excluded
            expect(result).toHaveLength(0);
        });

        it('org MEMBER with project access is included', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.EDITOR,
                            from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('multiple group roles', () => {
        it('highest group role wins', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    inheritParentPermissions: true,
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.VIEWER,
                            from: ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
                        },
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.EDITOR,
                            from: ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('inheritedFrom metadata', () => {
        it('reports organization when org role is highest', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.EDITOR,
                        },
                    ],
                }),
            );
            expect(result[0].inheritedFrom).toBe('organization');
        });

        it('reports project when project role is highest', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.EDITOR,
                            from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result[0].inheritedFrom).toBe('project');
        });

        it('reports group when group project role is highest', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.DEVELOPER,
                            from: ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result[0].inheritedFrom).toBe('group');
        });

        it('reports space_group when space group access role is highest', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    directAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: SpaceMemberRole.EDITOR,
                            from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                        },
                    ],
                }),
            );
            expect(result[0].inheritedFrom).toBe('space_group');
        });
    });

    describe('projectRole field', () => {
        it('only considers org + direct project membership (not groups)', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.DEVELOPER,
                            from: ProjectSpaceAccessOrigin.GROUP_MEMBERSHIP,
                        },
                    ],
                }),
            );
            // projectRole should be VIEWER (from org), not DEVELOPER (from group)
            expect(result[0].projectRole).toBe(ProjectMemberRole.VIEWER);
        });

        it('includes direct project membership in projectRole', () => {
            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'space-1',
                            role: ProjectMemberRole.EDITOR,
                            from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result[0].projectRole).toBe(ProjectMemberRole.EDITOR);
        });
    });

    describe('multiple users', () => {
        it('resolves access for multiple users independently', () => {
            const orgAccess: OrganizationSpaceAccess[] = [
                {
                    userUuid: 'user-1',
                    spaceUuid: 'space-1',
                    role: OrganizationMemberRole.EDITOR,
                },
                {
                    userUuid: 'user-2',
                    spaceUuid: 'space-1',
                    role: OrganizationMemberRole.VIEWER,
                },
            ];
            const directAccess: DirectSpaceAccess[] = [
                {
                    userUuid: 'user-2',
                    spaceUuid: 'space-1',
                    role: SpaceMemberRole.ADMIN,
                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                },
            ];
            const projectAccess: ProjectSpaceAccess[] = [];

            const result = resolveSpaceAccess(
                makeInput({
                    organizationAccess: orgAccess,
                    directAccess,
                    projectAccess,
                }),
            );

            expect(result).toHaveLength(2);

            const user1 = result.find((r) => r.userUuid === 'user-1');
            const user2 = result.find((r) => r.userUuid === 'user-2');

            expect(user1?.role).toBe(SpaceMemberRole.EDITOR);
            expect(user1?.hasDirectAccess).toBe(false);

            expect(user2?.role).toBe(SpaceMemberRole.ADMIN);
            expect(user2?.hasDirectAccess).toBe(true);
        });
    });
});

describe('resolveSpaceAccessWithInheritance', () => {
    const makeChainInput = (
        overrides: Partial<
            Parameters<typeof resolveSpaceAccessWithInheritance>[0]
        > = {},
    ) => ({
        spaceUuid: 'child-space',
        isPrivate: false,
        chainDirectAccess: [],
        projectAccess: [] as ProjectSpaceAccess[],
        organizationAccess: [] as OrganizationSpaceAccess[],
        ...overrides,
    });

    it('returns empty array for empty inputs', () => {
        const result = resolveSpaceAccessWithInheritance(makeChainInput());
        expect(result).toEqual([]);
    });

    describe('single-space chain (backward compat)', () => {
        it('org admin gets space ADMIN', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.ADMIN,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        it('direct user access on single space resolves correctly', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
            expect(result[0].hasDirectAccess).toBe(true);
        });
    });

    describe('most permissive wins across chain', () => {
        it('USER_ACCESS EDITOR on parent beats USER_ACCESS VIEWER on child', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('GROUP_ACCESS EDITOR on parent beats USER_ACCESS VIEWER on child', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        it('USER_ACCESS EDITOR on child already wins (child is higher)', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.VIEWER,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        it('three-level chain: grandparent ADMIN wins over child VIEWER', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [],
                        },
                        {
                            spaceUuid: 'grandparent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'grandparent-space',
                                    role: SpaceMemberRole.ADMIN,
                                    from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });
    });

    describe('hasDirectAccess', () => {
        it('is true when user has direct access only on parent (inherited)', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('is false when user has only project/org access', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.EDITOR,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].hasDirectAccess).toBe(false);
        });
    });

    describe('inheritedFrom metadata', () => {
        it('reports parent_space when winning role is from ancestor', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].inheritedFrom).toBe('parent_space');
        });

        it('does not report parent_space when winning role is from leaf', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].inheritedFrom).not.toBe('parent_space');
        });
    });

    describe('private chain', () => {
        it('no access without direct access on private chain', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    isPrivate: true,
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                    projectAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: ProjectMemberRole.EDITOR,
                            from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(0);
        });

        it('admin always gets access on private chain', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    isPrivate: true,
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.ADMIN,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        it('direct access on parent grants access on private child', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    isPrivate: true,
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('multiple users', () => {
        it('resolves each user independently', () => {
            const result = resolveSpaceAccessWithInheritance(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-2',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                            ],
                        },
                    ],
                    organizationAccess: [
                        {
                            userUuid: 'user-1',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                        {
                            userUuid: 'user-2',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.VIEWER,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(2);

            const user1 = result.find((r) => r.userUuid === 'user-1');
            const user2 = result.find((r) => r.userUuid === 'user-2');

            expect(user1?.role).toBe(SpaceMemberRole.VIEWER);
            expect(user2?.role).toBe(SpaceMemberRole.EDITOR);
            expect(user2?.inheritedFrom).toBe('parent_space');
        });
    });
});
