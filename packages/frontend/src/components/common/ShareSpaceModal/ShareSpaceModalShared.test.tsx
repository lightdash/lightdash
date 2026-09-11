import {
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceShare,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { UserAccessList } from './ShareSpaceModalShared';

describe('UserAccessList', () => {
    it.each([SpaceMemberRole.ADMIN, SpaceMemberRole.EDITOR])(
        'does not flag %s space access based on the placeholder Viewer project role',
        async (role) => {
            const sharedUser: SpaceShare = {
                userUuid: 'custom-role-user',
                firstName: 'Custom',
                lastName: 'Role',
                email: 'custom-role@example.com',
                isInternal: false,
                avatarUrl: null,
                avatarGradient: null,
                role,
                projectRole: ProjectMemberRole.VIEWER,
                hasDirectAccess: true,
                inheritedRole: undefined,
                inheritedFrom: undefined,
            };
            const onAccessChange = vi.fn();
            renderWithProviders(
                <UserAccessList
                    inheritParentPermissions={false}
                    accessList={[sharedUser]}
                    sessionUser={undefined}
                    onAccessChange={onAccessChange}
                    page={1}
                    totalPages={1}
                    onPageChange={vi.fn()}
                />,
            );
            const select = screen.getByRole('combobox');
            expect(select).not.toHaveAttribute('aria-invalid', 'true');
            await userEvent.hover(select);
            expect(
                screen.queryByText(
                    'User needs to be promoted to interactive viewer to have this space access',
                ),
            ).not.toBeInTheDocument();
            await userEvent.click(select);
            await userEvent.click(
                screen.getByRole('option', { name: /Can view/ }),
            );
            expect(onAccessChange).toHaveBeenCalledWith(
                SpaceMemberRole.VIEWER,
                sharedUser,
            );
        },
    );
});
