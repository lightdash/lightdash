import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    type OrganizationRoleSet,
    type SessionUser,
} from '@lightdash/common';
import { type RolesModel } from '../models/RolesModel';
import { InviteRenewalAuthorization } from './InviteRenewalAuthorization';
import { sessionUser } from './UserService.mock';

const organizationUuid = 'organizationUuid';
const recipientUuid = 'pending-member';
const projectUuid = 'shared-project';

const setup = () => {
    const roleSet: OrganizationRoleSet = {
        systemRole: OrganizationMemberRole.MEMBER,
        customRoleUuids: [],
    };
    const getOrganizationUserRoleSet = vi.fn<
        RolesModel['getOrganizationUserRoleSet']
    >(async (_organizationUuid, userUuid) =>
        userUuid === recipientUuid
            ? roleSet
            : { systemRole: null, customRoleUuids: [] },
    );
    const getRoleWithScopesByUuid =
        vi.fn<RolesModel['getRoleWithScopesByUuid']>();
    const getUserProjectRoleAssignments = vi.fn<
        ConstructorParameters<
            typeof InviteRenewalAuthorization
        >[0]['userModel']['getUserProjectRoleAssignments']
    >(async () => []);
    const findSessionUserAndOrgByUuid = vi.fn(async () => sessionUser);
    const canManageSpaces = vi.fn(async () => true);
    const assertCanRenewSharedAccess = vi.fn(async () => {});
    const findGrantedSpaceUuids = vi.fn(async (): Promise<string[]> => []);
    const service = new InviteRenewalAuthorization({
        rolesModel: {
            getOrganizationUserRoleSet,
            getRoleWithScopesByUuid,
        } as unknown as RolesModel,
        userModel: {
            getUserProjectRoleAssignments,
            findSessionUserAndOrgByUuid,
        },
        projectModel: {
            getSummaries: async (uuids) =>
                uuids.map((uuid) => ({
                    organizationUuid,
                    projectUuid: uuid,
                    type: ProjectType.DEFAULT,
                    createdByUserUuid: null,
                    slug: uuid,
                    name: uuid,
                })),
        },
        spacePermissionModel: { findGrantedSpaceUuids },
        spacePermissionService: { can: canManageSpaces },
        directAccessService: { assertCanRenewSharedAccess },
    });
    const member = { ...sessionUser, role: OrganizationMemberRole.MEMBER };
    const renew = (user: SessionUser = member, canGrantRoles = false) =>
        service.assertCanRenew({
            user,
            organizationUuid,
            recipientUuid,
            canGrantRoles,
            patEnabled: false,
        });
    return {
        renew,
        member,
        roleSet,
        getRoleWithScopesByUuid,
        getUserProjectRoleAssignments,
        findGrantedSpaceUuids,
        canManageSpaces,
        assertCanRenewSharedAccess,
    };
};

describe('pending invitation renewals', () => {
    test('allows an ordinary member renewal without org role management', async () => {
        await expect(setup().renew()).resolves.toBeUndefined();
    });

    test('uses the pending member’s stored system role for delegation', async () => {
        const { renew, member, roleSet } = setup();
        roleSet.systemRole = OrganizationMemberRole.ADMIN;
        await expect(renew(member, true)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        await expect(renew(sessionUser, true)).resolves.toBeUndefined();
    });

    test('checks retained organization custom scopes', async () => {
        const { renew, member, roleSet, getRoleWithScopesByUuid } = setup();
        roleSet.customRoleUuids = ['pending-custom-role'];
        getRoleWithScopesByUuid.mockResolvedValue({
            roleUuid: 'pending-custom-role',
            organizationUuid,
            name: 'Member management',
            description: '',
            level: 'organization',
            ownerType: 'user',
            createdBy: null,
            createdAt: null,
            updatedAt: null,
            scopes: ['manage:OrganizationMemberProfile'],
        });
        await expect(renew(member, true)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
    });

    test('requires delegation on the project whose assignment is retained', async () => {
        const { renew, member, getUserProjectRoleAssignments } = setup();
        getUserProjectRoleAssignments.mockResolvedValue([
            {
                projectUuid,
                userUuid: recipientUuid,
                role: ProjectMemberRole.VIEWER,
                roleUuid: undefined,
            },
        ]);
        const withProjectAdmin = (uuid: string): SessionUser => ({
            ...member,
            ability: defineUserAbility(member, [
                {
                    projectUuid: uuid,
                    userUuid: member.userUuid,
                    role: ProjectMemberRole.ADMIN,
                    roleUuid: undefined,
                },
            ]),
        });
        await expect(
            renew(withProjectAdmin('different-project')),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            renew(withProjectAdmin(projectUuid)),
        ).resolves.toBeUndefined();
    });

    test('checks space sharing only when the recipient has a space grant', async () => {
        const { renew, member, findGrantedSpaceUuids, canManageSpaces } =
            setup();
        canManageSpaces.mockResolvedValue(false);
        await expect(renew()).resolves.toBeUndefined();

        findGrantedSpaceUuids.mockResolvedValue(['shared-space']);
        await expect(renew()).rejects.toBeInstanceOf(ForbiddenError);
        expect(canManageSpaces).toHaveBeenCalledWith('manage', member, [
            'shared-space',
        ]);
    });

    test('honors the existing authorization for directly shared resources', async () => {
        const { renew, assertCanRenewSharedAccess } = setup();
        assertCanRenewSharedAccess.mockRejectedValue(new ForbiddenError());
        await expect(renew()).rejects.toBeInstanceOf(ForbiddenError);
        expect(assertCanRenewSharedAccess).toHaveBeenCalledWith(
            expect.anything(),
            recipientUuid,
        );
    });
});
