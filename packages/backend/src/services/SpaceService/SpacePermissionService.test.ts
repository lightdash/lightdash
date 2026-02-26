import {
    DirectSpaceAccessOrigin,
    NotFoundError,
    ProjectSpaceAccessOrigin,
    SpaceMemberRole,
    type DirectSpaceAccess,
    type OrganizationMemberRole,
    type OrganizationSpaceAccess,
    type ProjectMemberRole,
    type ProjectSpaceAccess,
    type SpaceInheritanceChain,
} from '@lightdash/common';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { SpacePermissionService } from './SpacePermissionService';

const createMockSpacePermissionModel = () => ({
    getInheritanceChains: jest.fn<
        Promise<Record<string, SpaceInheritanceChain>>,
        [string[]]
    >(),
    getDirectSpaceAccess: jest.fn<
        Promise<Record<string, DirectSpaceAccess[]>>,
        [string[], { userUuid?: string }?]
    >(),
    getProjectSpaceAccess: jest.fn<
        Promise<Record<string, ProjectSpaceAccess[]>>,
        [string[], { userUuid?: string }?]
    >(),
    getOrganizationSpaceAccess: jest.fn<
        Promise<Record<string, OrganizationSpaceAccess[]>>,
        [string[], { userUuid?: string }?]
    >(),
    getSpaceInfo: jest.fn<
        Promise<
            Record<
                string,
                {
                    isPrivate: boolean;
                    projectUuid: string;
                    organizationUuid: string;
                }
            >
        >,
        [string[]]
    >(),
    getGroupAccess: jest.fn(),
    getUserMetadataByUuids: jest.fn(),
});

describe('SpacePermissionService', () => {
    const mockPermissionModel = createMockSpacePermissionModel();
    const service = new SpacePermissionService(
        {
            get: async () => ({
                id: 'nested-spaces-permissions',
                enabled: true,
            }),
        } as unknown as FeatureFlagModel,
        {} as SpaceModel,
        mockPermissionModel as unknown as SpacePermissionModel,
    );

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('getSpacesCaslContext (via getAllSpaceAccessContext)', () => {
        const projectUuid = 'project-uuid';
        const organizationUuid = 'org-uuid';
        const userUuid = 'user-uuid';

        test('root space with inherit=true includes project and org access', async () => {
            const spaceUuid = 'root-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'root-space': {
                    chain: [
                        {
                            spaceUuid: 'root-space',
                            spaceName: 'Root',
                            inheritParentPermissions: true,
                        },
                    ],
                    inheritsFromOrgOrProject: true,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({
                'root-space': [
                    {
                        userUuid,
                        spaceUuid: 'root-space',
                        role: 'editor' as ProjectMemberRole,
                        from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                    },
                ],
            });
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue({
                'root-space': [
                    {
                        userUuid,
                        spaceUuid: 'root-space',
                        role: 'member' as OrganizationMemberRole,
                    },
                ],
            });
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: false,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            expect(result.isPrivate).toBe(false);
            expect(result.projectUuid).toBe(projectUuid);
            // Project access was fetched for the root space
            expect(
                mockPermissionModel.getProjectSpaceAccess,
            ).toHaveBeenCalledWith(['root-space'], undefined);
            expect(
                mockPermissionModel.getOrganizationSpaceAccess,
            ).toHaveBeenCalledWith(['root-space'], undefined);
        });

        test('space with inherit=false is treated as private, direct access user gets role', async () => {
            const spaceUuid = 'private-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'private-space': {
                    chain: [
                        {
                            spaceUuid: 'private-space',
                            spaceName: 'Private',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: SpaceMemberRole.EDITOR,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: SpaceMemberRole.VIEWER,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: 'viewer' as ProjectMemberRole,
                        from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                    },
                ],
            });
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: 'member' as OrganizationMemberRole,
                    },
                ],
            });
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: true,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            expect(result.isPrivate).toBe(true);
            expect(result.access).toHaveLength(1);
            expect(result.access[0].userUuid).toBe(userUuid);
            expect(result.access[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        test('org admin without direct access is NOT in access list (CASL handles admin permissions)', async () => {
            const spaceUuid = 'private-space';
            const adminUuid = 'admin-user';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'private-space': {
                    chain: [
                        {
                            spaceUuid: 'private-space',
                            spaceName: 'Private',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // No direct access for the admin
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid: adminUuid,
                        spaceUuid: 'private-space',
                        role: 'admin' as ProjectMemberRole,
                        from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                    },
                ],
            });
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid: adminUuid,
                        spaceUuid: 'private-space',
                        role: 'admin' as OrganizationMemberRole,
                    },
                ],
            });
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: true,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            // Admin is not in the access list — CASL grants admin users
            // blanket can('manage', 'Space') at the org/project ability level,
            // so the resolver doesn't need to include them explicitly.
            expect(result.access).toHaveLength(0);
        });

        test('nested space aggregates direct access from all ancestors in chain', async () => {
            const spaceUuid = 'child-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'child-space': {
                    chain: [
                        {
                            spaceUuid: 'child-space',
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: 'parent-space',
                            spaceName: 'Parent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            const userA = 'user-a';
            const userB = 'user-b';

            // Each user has both USER_ACCESS and GROUP_ACCESS (group provides
            // the project-level role that resolveSpaceAccess requires)
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'child-space': [
                    {
                        userUuid: userA,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid: userA,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
                'parent-space': [
                    {
                        userUuid: userB,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid: userB,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue(
                {},
            );
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: true,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            // Both users should have access (aggregated from child + parent)
            expect(result.access).toHaveLength(2);
            const userAAccess = result.access.find((a) => a.userUuid === userA);
            const userBAccess = result.access.find((a) => a.userUuid === userB);
            expect(userAAccess).toBeDefined();
            expect(userBAccess).toBeDefined();

            // Direct access was fetched for both chain spaces
            expect(
                mockPermissionModel.getDirectSpaceAccess,
            ).toHaveBeenCalledWith(
                expect.arrayContaining(['child-space', 'parent-space']),
                undefined,
            );
        });

        test('chain with all inherit=true reaches project/org level', async () => {
            const spaceUuid = 'grandchild-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'grandchild-space': {
                    chain: [
                        {
                            spaceUuid: 'grandchild-space',
                            spaceName: 'Grandchild',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: 'parent-space',
                            spaceName: 'Parent',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: 'root-space',
                            spaceName: 'Root',
                            inheritParentPermissions: true,
                        },
                    ],
                    inheritsFromOrgOrProject: true,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({
                'root-space': [
                    {
                        userUuid,
                        spaceUuid: 'root-space',
                        role: 'editor' as ProjectMemberRole,
                        from: ProjectSpaceAccessOrigin.PROJECT_MEMBERSHIP,
                    },
                ],
            });
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue(
                {},
            );
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: false,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            expect(result.isPrivate).toBe(false);
            // Project access fetched for the root space (last in chain)
            expect(
                mockPermissionModel.getProjectSpaceAccess,
            ).toHaveBeenCalledWith(['root-space'], undefined);
            // User gets access via project membership
            expect(result.access).toHaveLength(1);
            expect(result.access[0].userUuid).toBe(userUuid);
        });

        test('chain stops at inherit=false ancestor, user gets access via direct chain access', async () => {
            const spaceUuid = 'deep-child';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'deep-child': {
                    chain: [
                        {
                            spaceUuid: 'deep-child',
                            spaceName: 'Deep Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: 'middle-space',
                            spaceName: 'Middle',
                            inheritParentPermissions: false, // stops here
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'middle-space': [
                    {
                        userUuid,
                        spaceUuid: 'middle-space',
                        role: SpaceMemberRole.ADMIN,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue(
                {},
            );
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: true,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            expect(result.isPrivate).toBe(true);
            // User gets admin via parent's group access
            expect(result.access).toHaveLength(1);
            expect(result.access[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        test('most permissive wins: higher role on parent overrides lower on child', async () => {
            const spaceUuid = 'child-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'child-space': {
                    chain: [
                        {
                            spaceUuid: 'child-space',
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: 'parent-space',
                            spaceName: 'Parent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'child-space': [
                    {
                        userUuid,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
                'parent-space': [
                    {
                        userUuid,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        groupUuid: null,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue(
                {},
            );
            mockPermissionModel.getSpaceInfo.mockResolvedValue({
                [spaceUuid]: {
                    isPrivate: true,
                    projectUuid,
                    organizationUuid,
                },
            });

            const result = await service.getAllSpaceAccessContext(spaceUuid);

            expect(result.access).toHaveLength(1);
            // Should get EDITOR from parent, not VIEWER from child
            expect(result.access[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        test('throws NotFoundError when space info is missing', async () => {
            const spaceUuid = 'missing-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                'missing-space': {
                    chain: [
                        {
                            spaceUuid: 'missing-space',
                            spaceName: 'Missing',
                            inheritParentPermissions: true,
                        },
                    ],
                    inheritsFromOrgOrProject: true,
                },
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getProjectSpaceAccess.mockResolvedValue({});
            mockPermissionModel.getOrganizationSpaceAccess.mockResolvedValue(
                {},
            );
            mockPermissionModel.getSpaceInfo.mockResolvedValue({});

            await expect(
                service.getAllSpaceAccessContext(spaceUuid),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('getInheritedPermissionsToCopy', () => {
        const projectUuid = 'project-uuid';
        const organizationUuid = 'org-uuid';

        test('returns user and group entries from ancestor spaces', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';
            const userOnParent = 'user-on-parent';

            // Chain: child → parent (root, inherits from org/project)
            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: true,
                        },
                    ],
                    inheritsFromOrgOrProject: true,
                },
            });

            // Parent has user access and group access
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                [parentSpaceUuid]: [
                    {
                        userUuid: userOnParent,
                        spaceUuid: parentSpaceUuid,
                        groupUuid: null,
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid: userOnParent,
                        spaceUuid: parentSpaceUuid,
                        groupUuid: 'group-1',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // User entry from parent
            expect(result.userAccessEntries).toHaveLength(1);
            expect(result.userAccessEntries[0]).toEqual({
                userUuid: userOnParent,
                role: SpaceMemberRole.EDITOR,
            });

            // Group entry from parent
            expect(result.groupAccessEntries).toHaveLength(1);
            expect(result.groupAccessEntries[0]).toEqual({
                groupUuid: 'group-1',
                role: SpaceMemberRole.EDITOR,
            });
        });

        test('includes ancestor entries regardless of leaf access', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';
            const directUser = 'direct-user';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // Only ancestor (parent) entries are returned — leaf entries are excluded
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                [parentSpaceUuid]: [
                    {
                        userUuid: directUser,
                        spaceUuid: parentSpaceUuid,
                        groupUuid: null,
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                ],
            });

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // Ancestor user entry is included (DB-level ON CONFLICT MERGE
            // handles dedup with any existing leaf access)
            expect(result.userAccessEntries).toHaveLength(1);
            expect(result.userAccessEntries[0]).toEqual({
                userUuid: directUser,
                role: SpaceMemberRole.EDITOR,
            });
        });

        test('only includes entries from ancestors, not the leaf space', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';
            const directUser = 'direct-user';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // No ancestor entries — parent has no direct access
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // Nothing from ancestors to copy
            expect(result.userAccessEntries).toHaveLength(0);
            expect(result.groupAccessEntries).toHaveLength(0);
        });

        test('includes all ancestor group entries (DB handles dedup)', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // Parent has two groups
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                [parentSpaceUuid]: [
                    {
                        userUuid: 'user-in-group-1',
                        spaceUuid: parentSpaceUuid,
                        groupUuid: 'group-1',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                    {
                        userUuid: 'user-in-group-2',
                        spaceUuid: parentSpaceUuid,
                        groupUuid: 'group-2',
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // Both ancestor groups are included; ON CONFLICT MERGE at DB
            // level handles any duplicates with existing child groups
            expect(result.groupAccessEntries).toHaveLength(2);
            expect(result.groupAccessEntries).toEqual(
                expect.arrayContaining([
                    { groupUuid: 'group-1', role: SpaceMemberRole.EDITOR },
                    { groupUuid: 'group-2', role: SpaceMemberRole.VIEWER },
                ]),
            );
        });

        test('returns empty when no inherited users or ancestor groups', async () => {
            const rootSpaceUuid = 'root-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [rootSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: rootSpaceUuid,
                            spaceName: 'Root',
                            inheritParentPermissions: true,
                        },
                    ],
                    inheritsFromOrgOrProject: true,
                },
            });

            // Root has no ancestors, so getDirectSpaceAccess is called with []
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({});

            const result =
                await service.getInheritedPermissionsToCopy(rootSpaceUuid);

            expect(result.userAccessEntries).toHaveLength(0);
            expect(result.groupAccessEntries).toHaveLength(0);
        });

        test('deduplicates same group across ancestors, keeping highest role', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';
            const grandparentSpaceUuid = 'grandparent-space';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: grandparentSpaceUuid,
                            spaceName: 'Grandparent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // Same group on parent (VIEWER) and grandparent (EDITOR)
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                [parentSpaceUuid]: [
                    {
                        userUuid: 'user-in-group',
                        spaceUuid: parentSpaceUuid,
                        groupUuid: 'group-1',
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
                [grandparentSpaceUuid]: [
                    {
                        userUuid: 'user-in-group',
                        spaceUuid: grandparentSpaceUuid,
                        groupUuid: 'group-1',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
            });

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // Same group appears on two ancestors — deduplicated to one entry
            // with the highest role (EDITOR > VIEWER)
            expect(result.groupAccessEntries).toHaveLength(1);
            expect(result.groupAccessEntries[0]).toEqual({
                groupUuid: 'group-1',
                role: SpaceMemberRole.EDITOR,
            });
        });

        test('deduplicates same user across ancestors, keeping highest role', async () => {
            const childSpaceUuid = 'child-space';
            const parentSpaceUuid = 'parent-space';
            const grandparentSpaceUuid = 'grandparent-space';
            const duplicateUser = 'duplicate-user';

            mockPermissionModel.getInheritanceChains.mockResolvedValue({
                [childSpaceUuid]: {
                    chain: [
                        {
                            spaceUuid: childSpaceUuid,
                            spaceName: 'Child',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: parentSpaceUuid,
                            spaceName: 'Parent',
                            inheritParentPermissions: true,
                        },
                        {
                            spaceUuid: grandparentSpaceUuid,
                            spaceName: 'Grandparent',
                            inheritParentPermissions: false,
                        },
                    ],
                    inheritsFromOrgOrProject: false,
                },
            });

            // Same user on parent (VIEWER) and grandparent (ADMIN)
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                [parentSpaceUuid]: [
                    {
                        userUuid: duplicateUser,
                        spaceUuid: parentSpaceUuid,
                        groupUuid: null,
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                ],
                [grandparentSpaceUuid]: [
                    {
                        userUuid: duplicateUser,
                        spaceUuid: grandparentSpaceUuid,
                        groupUuid: null,
                        role: SpaceMemberRole.ADMIN,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                ],
            });

            const result =
                await service.getInheritedPermissionsToCopy(childSpaceUuid);

            // Same user appears on two ancestors — deduplicated to one entry
            // with the highest role (ADMIN > VIEWER)
            expect(result.userAccessEntries).toHaveLength(1);
            expect(result.userAccessEntries[0]).toEqual({
                userUuid: duplicateUser,
                role: SpaceMemberRole.ADMIN,
            });
            expect(result.groupAccessEntries).toHaveLength(0);
        });
    });
});
