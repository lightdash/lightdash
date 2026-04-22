import { OrganizationMemberRole } from '../../types/organizationMemberProfile';
import { ProjectMemberRole } from '../../types/projectMemberRole';
import {
    DirectSpaceAccessOrigin,
    ProjectSpaceAccessOrigin,
    SpaceMemberRole,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
} from '../../types/space';
import { resolveSpaceAccess } from './spaceAccessResolver';

describe('resolveSpaceAccess', () => {
    const makeChainInput = (
        overrides: Partial<Parameters<typeof resolveSpaceAccess>[0]> = {},
    ) => ({
        spaceUuid: 'child-space',
        inheritsFromOrgOrProject: true,
        chainDirectAccess: [],
        projectAccess: [] as ProjectSpaceAccess[],
        organizationAccess: [] as OrganizationSpaceAccess[],
        ...overrides,
    });

    it('returns empty array for empty inputs', () => {
        const result = resolveSpaceAccess(makeChainInput());
        expect(result).toEqual([]);
    });

    describe('single-space chain (backward compat)', () => {
        it('org admin gets space ADMIN', () => {
            const result = resolveSpaceAccess(
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    groupUuid: null,
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
                                    groupUuid: null,
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
                                    groupUuid: 'group-1',
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    groupUuid: null,
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
                                    groupUuid: null,
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
                                    groupUuid: 'group-1',
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
        it('is false when user has direct access only on parent (inherited)', () => {
            const result = resolveSpaceAccess(
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
                                    groupUuid: null,
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
            expect(result[0].hasDirectAccess).toBe(false);
        });

        it('is true when user has direct access on the leaf space', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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

        it('is false when user has group access only on parent', () => {
            const result = resolveSpaceAccess(
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
                                    groupUuid: 'group-1',
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
            expect(result[0].hasDirectAccess).toBe(false);
            expect(result[0].inheritedFrom).toBe('parent_space');
        });

        it('is false when user has only project/org access', () => {
            const result = resolveSpaceAccess(
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
            const result = resolveSpaceAccess(
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
                                    groupUuid: null,
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

        it('reports parent_space when group access is from ancestor', () => {
            const result = resolveSpaceAccess(
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
                                    groupUuid: 'group-1',
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
            expect(result[0].inheritedFrom).toBe('parent_space');
            expect(result[0].hasDirectAccess).toBe(false);
        });

        it('does not report parent_space when winning role is from leaf', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    groupUuid: null,
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
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

        it('admin without direct access is excluded (CASL handles admin access)', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
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
            expect(result).toHaveLength(0);
        });

        it('direct access on parent grants access on private child', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        { spaceUuid: 'child-space', directAccess: [] },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.EDITOR,
                                    groupUuid: null,
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
            const result = resolveSpaceAccess(
                makeChainInput({
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
                                    groupUuid: null,
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

    describe('project member access (via GROUP_ACCESS on space column)', () => {
        // These tests simulate what happens when a space has
        // project_member_access_role set and the DB UNION expands
        // project members as GROUP_ACCESS entries.

        it('grants access to project member on private space', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
            expect(result[0].role).toBe(SpaceMemberRole.VIEWER);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('project member access coexists with explicit user access — highest wins', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                // Explicit user access as EDITOR
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.EDITOR,
                                    groupUuid: null,
                                    from: DirectSpaceAccessOrigin.USER_ACCESS,
                                },
                                // Project member access as VIEWER
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
            // USER_ACCESS takes priority over GROUP_ACCESS
            expect(result[0].role).toBe(SpaceMemberRole.EDITOR);
            expect(result[0].hasDirectAccess).toBe(true);
        });

        it('without project member access, user has no access to private space', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [],
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
            // Non-admin user without direct access on private space = no access
            expect(result).toHaveLength(0);
        });

        it('multiple project members all get access on private space', () => {
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
                                    from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                                },
                                {
                                    userUuid: 'user-2',
                                    spaceUuid: 'child-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
                        {
                            userUuid: 'user-2',
                            spaceUuid: 'child-space',
                            role: OrganizationMemberRole.EDITOR,
                        },
                    ],
                }),
            );
            expect(result).toHaveLength(2);
            expect(result.find((r) => r.userUuid === 'user-1')?.role).toBe(
                SpaceMemberRole.VIEWER,
            );
            expect(result.find((r) => r.userUuid === 'user-2')?.role).toBe(
                SpaceMemberRole.VIEWER,
            );
        });

        it('child inheriting from restricted parent with project member access', () => {
            // parent = restricted with project_member_access_role
            // child = inherits from parent
            // The UNION returns access on the parent, which the child inherits
            const result = resolveSpaceAccess(
                makeChainInput({
                    inheritsFromOrgOrProject: false,
                    chainDirectAccess: [
                        {
                            spaceUuid: 'child-space',
                            directAccess: [],
                        },
                        {
                            spaceUuid: 'parent-space',
                            directAccess: [
                                {
                                    userUuid: 'user-1',
                                    spaceUuid: 'parent-space',
                                    role: SpaceMemberRole.VIEWER,
                                    groupUuid: null,
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
            expect(result[0].role).toBe(SpaceMemberRole.VIEWER);
            expect(result[0].inheritedFrom).toBe('parent_space');
        });
    });
});
