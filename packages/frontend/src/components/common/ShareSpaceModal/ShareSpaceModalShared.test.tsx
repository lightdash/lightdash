import {
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceShareWithPermissions,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { UserAccessList } from './ShareSpaceModalShared';

describe('UserAccessList', () => {
    it.each([
        SpaceMemberRole.ADMIN,
        SpaceMemberRole.EDITOR,
        SpaceMemberRole.VIEWER,
    ])(
        'does not flag %s space access based on the placeholder Viewer project role',
        async (role) => {
            const sharedUser: SpaceShareWithPermissions = {
                userUuid: 'custom-role-user',
                firstName: 'Custom',
                lastName: 'Role',
                email: 'custom-role@example.com',
                isInternal: false,
                avatarUrl: null,
                avatarGradient: null,
                permissions: {
                    canEditCharts: role !== SpaceMemberRole.VIEWER,
                    canEditDashboards: role !== SpaceMemberRole.VIEWER,
                    canManageSpace: role === SpaceMemberRole.ADMIN,
                },
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
                screen.queryByRole('button', {
                    name: /Their roles do not allow/,
                }),
            ).not.toBeInTheDocument();
            await userEvent.click(select);
            await userEvent.click(
                screen.getByRole('option', {
                    name:
                        role === SpaceMemberRole.VIEWER
                            ? /Can edit/
                            : /Can view/,
                }),
            );
            expect(onAccessChange).toHaveBeenCalledWith(
                role === SpaceMemberRole.VIEWER
                    ? SpaceMemberRole.EDITOR
                    : SpaceMemberRole.VIEWER,
                sharedUser,
            );
        },
    );
    it.each([true, false])(
        'warns about missing recipient permissions (direct access: %s)',
        async (hasDirectAccess) => {
            const sharedUser: SpaceShareWithPermissions = {
                userUuid: 'limited-user',
                firstName: 'Limited',
                lastName: 'User',
                email: 'limited@example.com',
                isInternal: false,
                avatarUrl: null,
                avatarGradient: null,
                role: SpaceMemberRole.ADMIN,
                projectRole: ProjectMemberRole.EDITOR,
                hasDirectAccess,
                inheritedRole: undefined,
                inheritedFrom: undefined,
                permissions: {
                    canEditCharts: false,
                    canEditDashboards: true,
                    canManageSpace: false,
                },
            };
            renderWithProviders(
                <UserAccessList
                    inheritParentPermissions={false}
                    accessList={[sharedUser]}
                    sessionUser={undefined}
                    onAccessChange={vi.fn()}
                    page={1}
                    totalPages={1}
                    onPageChange={vi.fn()}
                />,
            );
            const warning = screen.getByRole('button', {
                name: /Their roles do not allow: editing charts, managing this space/,
            });
            await userEvent.hover(warning);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'Update their organization or project permissions',
            );
            if (hasDirectAccess) {
                expect(screen.getByRole('combobox')).toBeEnabled();
            } else {
                expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
                expect(screen.getByText('Full access')).toBeInTheDocument();
            }
        },
    );
});
