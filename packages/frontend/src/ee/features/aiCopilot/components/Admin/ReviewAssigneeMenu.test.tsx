import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ReviewAssigneeMenu } from './ReviewAssigneeMenu';

const updateMutate = vi.fn();

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useUpdateAiAgentReviewItemAssignee: () => ({
        mutate: updateMutate,
        isLoading: false,
    }),
}));

// One user with a direct project role, one whose project access is inherited
// (projectRole === null). The old picker filtered to direct ADMIN/DEVELOPER
// members and dropped the inherited user — this is the case ZAP-520 fixes.
const usersWithProjectRole = [
    {
        userUuid: 'direct-admin',
        firstName: 'Dana',
        lastName: 'Direct',
        email: 'dana@example.com',
        projectRole: 'admin',
    },
    {
        userUuid: 'inherited-user',
        firstName: 'Ingrid',
        lastName: 'Inherited',
        email: 'ingrid@example.com',
        projectRole: null,
    },
];

vi.mock('../../../../../hooks/useProjectUsersWithRolesV2', () => ({
    useProjectUsersWithRoles: () => ({ usersWithProjectRole }),
}));

describe('ReviewAssigneeMenu', () => {
    it('lists every project user, including those with inherited access', async () => {
        renderWithProviders(
            <ReviewAssigneeMenu
                projectUuid="p"
                fingerprint="fp"
                assignedToUserUuid={null}
            />,
        );

        fireEvent.click(screen.getByLabelText('Assign user'));

        expect(await screen.findByText('Dana Direct')).toBeInTheDocument();
        // Previously excluded: access is inherited, no direct project role.
        expect(await screen.findByText('Ingrid Inherited')).toBeInTheDocument();
    });
});
