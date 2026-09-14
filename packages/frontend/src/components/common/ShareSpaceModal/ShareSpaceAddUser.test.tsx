import {
    OrganizationMemberRole,
    SpaceMemberRole,
    type OrganizationMemberProfile,
    type Space,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';

const organizationUsers: OrganizationMemberProfile[] = [];
const organizationUsersData = { pages: [{ data: organizationUsers }] };
const organizationGroupsData = { pages: [{ data: [] }] };
const spaceAccessByUserUuid = new Map();
const serviceAccounts = [
    { userUuid: 'automation-user', description: 'Warehouse automation' },
];
const shareSpace = vi.fn();

vi.mock('../../../hooks/useSpaceServiceAccounts', () => ({
    useSpaceServiceAccounts: () => ({
        data: serviceAccounts,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useOrganizationGroups', () => ({
    useInfiniteOrganizationGroups: () => ({
        data: organizationGroupsData,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetching: false,
    }),
}));

vi.mock('../../../hooks/useOrganizationUsers', () => ({
    useInfiniteOrganizationUsers: () => ({
        data: organizationUsersData,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetching: false,
    }),
}));

vi.mock('../../../hooks/useProjectAccess', () => ({
    useProjectAccess: () => ({ data: [] }),
}));

vi.mock('../../../hooks/useSpaceAccess', () => ({
    useSpaceAccessByUserUuids: () => ({
        map: spaceAccessByUserUuid,
        isLoading: false,
        isError: false,
    }),
}));

vi.mock('../../../hooks/useSpaces', () => ({
    useAddGroupSpaceShareMutation: () => ({ mutateAsync: vi.fn() }),
    useAddSpaceShareMutation: () => ({ mutateAsync: shareSpace }),
    useUpdateMutation: () => ({ mutateAsync: vi.fn() }),
}));

const makeOrganizationUser = (
    userUuid: string,
    email: string,
    roleUuid: string | undefined,
    hasMultipleRoles = false,
): OrganizationMemberProfile => ({
    userUuid,
    userCreatedAt: new Date('2026-01-01'),
    userUpdatedAt: new Date('2026-01-01'),
    firstName: '',
    lastName: '',
    email,
    organizationUuid: 'organization-uuid',
    role: OrganizationMemberRole.MEMBER,
    roleUuid,
    hasMultipleRoles,
    isActive: true,
    avatarUrl: null,
    avatarGradient: null,
});

const space: Space = {
    organizationUuid: 'organization-uuid',
    uuid: 'space-uuid',
    name: 'Restricted space',
    inheritsFromOrgOrProject: false,
    queries: [],
    projectUuid: 'project-uuid',
    dashboards: [],
    access: [],
    groupsAccess: [],
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'restricted-space',
    childSpaces: [],
    parentSpaceUuid: null,
    inheritParentPermissions: false,
    projectMemberAccessRole: null,
    colorPaletteUuid: null,
    path: 'restricted_space',
};

describe('ShareSpaceAddUser', () => {
    beforeEach(() => {
        spaceAccessByUserUuid.clear();
        shareSpace.mockReset();
        organizationUsers.splice(
            0,
            organizationUsers.length,
            makeOrganizationUser(
                'custom-role-user',
                'custom-role@example.com',
                'custom-role-uuid',
            ),
            makeOrganizationUser(
                'additional-custom-role-user',
                'additional-custom-role@example.com',
                undefined,
                true,
            ),
            makeOrganizationUser(
                'organization-member',
                'member@example.com',
                undefined,
            ),
        );
    });

    it('offers custom organization role users but not ineligible organization members', async () => {
        renderWithProviders(
            <ShareSpaceAddUser space={space} projectUuid="project-uuid" />,
        );

        await userEvent.click(
            screen.getByPlaceholderText(
                'Select groups or users to share this space with',
            ),
        );

        expect(
            await screen.findByText('custom-role@example.com'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('additional-custom-role@example.com'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('member@example.com'),
        ).not.toBeInTheDocument();
    });

    it('finds and shares a service account by description using its backing user UUID', async () => {
        renderWithProviders(
            <ShareSpaceAddUser space={space} projectUuid="project-uuid" />,
        );
        await userEvent.type(
            screen.getByPlaceholderText(
                'Select groups or users to share this space with',
            ),
            'Warehouse',
        );
        const option = await screen.findByRole('option', {
            name: /Warehouse automation/,
        });
        expect(screen.getByText('Service account')).toBeInTheDocument();
        await userEvent.click(option);
        await userEvent.click(screen.getByRole('button', { name: 'Share' }));

        expect(shareSpace).toHaveBeenCalledWith([
            'automation-user',
            SpaceMemberRole.VIEWER,
        ]);
    });

    it('does not offer an account already shared directly', async () => {
        spaceAccessByUserUuid.set('automation-user', {
            hasDirectAccess: true,
            role: SpaceMemberRole.EDITOR,
        });
        renderWithProviders(
            <ShareSpaceAddUser space={space} projectUuid="project-uuid" />,
        );
        await userEvent.click(
            screen.getByPlaceholderText(
                'Select groups or users to share this space with',
            ),
        );

        expect(
            screen.queryByRole('option', { name: /Warehouse automation/ }),
        ).not.toBeInTheDocument();
    });

    it('preserves the inherited role when adding a direct service-account grant', async () => {
        spaceAccessByUserUuid.set('automation-user', {
            hasDirectAccess: true,
            inheritedFrom: 'parent_space',
            role: SpaceMemberRole.EDITOR,
        });
        renderWithProviders(
            <ShareSpaceAddUser space={space} projectUuid="project-uuid" />,
        );
        await userEvent.click(
            screen.getByPlaceholderText(
                'Select groups or users to share this space with',
            ),
        );
        await userEvent.click(
            await screen.findByRole('option', {
                name: /Warehouse automation/,
            }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Share' }));

        expect(shareSpace).toHaveBeenCalledWith([
            'automation-user',
            SpaceMemberRole.EDITOR,
        ]);
    });
});
