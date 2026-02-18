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
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { SpacePermissionService } from './SpacePermissionService';

const createMockSpacePermissionModel = () => ({
    getInheritanceChain: jest.fn<Promise<SpaceInheritanceChain>, [string]>(),
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

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
                chain: [
                    {
                        spaceUuid: 'root-space',
                        spaceName: 'Root',
                        inheritParentPermissions: true,
                    },
                ],
                inheritsFromOrgOrProject: true,
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

        test('space with inherit=false is treated as private, skips project/org access', async () => {
            const spaceUuid = 'private-space';

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
                chain: [
                    {
                        spaceUuid: 'private-space',
                        spaceName: 'Private',
                        inheritParentPermissions: false,
                    },
                ],
                inheritsFromOrgOrProject: false,
            });

            // User has direct space access AND group-based access (which provides
            // the project-level role that resolveSpaceAccess needs)
            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'private-space': [
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'private-space',
                        role: SpaceMemberRole.VIEWER,
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
            // Project/org access should NOT have been fetched
            expect(
                mockPermissionModel.getProjectSpaceAccess,
            ).not.toHaveBeenCalled();
            expect(
                mockPermissionModel.getOrganizationSpaceAccess,
            ).not.toHaveBeenCalled();
            // User has access via direct access
            expect(result.access).toHaveLength(1);
            expect(result.access[0].userUuid).toBe(userUuid);
            expect(result.access[0].role).toBe(SpaceMemberRole.EDITOR);
        });

        test('nested space aggregates direct access from all ancestors in chain', async () => {
            const spaceUuid = 'child-space';

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
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
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid: userA,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
                'parent-space': [
                    {
                        userUuid: userB,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid: userB,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
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

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
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

        test('chain stops at inherit=false ancestor, project/org access excluded', async () => {
            const spaceUuid = 'deep-child';

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
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
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'middle-space': [
                    {
                        userUuid,
                        spaceUuid: 'middle-space',
                        role: SpaceMemberRole.ADMIN,
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
            expect(
                mockPermissionModel.getProjectSpaceAccess,
            ).not.toHaveBeenCalled();
            expect(
                mockPermissionModel.getOrganizationSpaceAccess,
            ).not.toHaveBeenCalled();
            // User gets admin via parent's group access
            expect(result.access).toHaveLength(1);
            expect(result.access[0].role).toBe(SpaceMemberRole.ADMIN);
        });

        test('most permissive wins: higher role on parent overrides lower on child', async () => {
            const spaceUuid = 'child-space';

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
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
            });

            mockPermissionModel.getDirectSpaceAccess.mockResolvedValue({
                'child-space': [
                    {
                        userUuid,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'child-space',
                        role: SpaceMemberRole.VIEWER,
                        from: DirectSpaceAccessOrigin.GROUP_ACCESS,
                    },
                ],
                'parent-space': [
                    {
                        userUuid,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
                        from: DirectSpaceAccessOrigin.USER_ACCESS,
                    },
                    {
                        userUuid,
                        spaceUuid: 'parent-space',
                        role: SpaceMemberRole.EDITOR,
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

            mockPermissionModel.getInheritanceChain.mockResolvedValue({
                chain: [
                    {
                        spaceUuid: 'missing-space',
                        spaceName: 'Missing',
                        inheritParentPermissions: true,
                    },
                ],
                inheritsFromOrgOrProject: true,
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
});
