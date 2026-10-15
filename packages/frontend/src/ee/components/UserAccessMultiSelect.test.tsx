import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { UserAccessMultiSelect } from './UserAccessMultiSelect';

// The org user search is paginated, so a selected user is often not in the
// results the picker has loaded. The picker must still label their pill.
vi.mock('../../hooks/useProjectUsersWithRoles', () => ({
    useProjectUsersWithRoles: () => ({
        usersWithProjectRole: [],
        isLoading: false,
        inheritedRoles: {},
    }),
}));

describe('UserAccessMultiSelect', () => {
    it('labels a selected user who is not in the search results from the agent details', () => {
        renderWithProviders(
            <UserAccessMultiSelect
                projectUuid="project-1"
                value={['user-1']}
                onChange={() => {}}
                selectedUserDetails={[
                    {
                        userUuid: 'user-1',
                        firstName: 'Ada',
                        lastName: 'Lovelace',
                        email: 'ada@example.com',
                    },
                ]}
            />,
        );

        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
        expect(screen.queryByText('user-1')).not.toBeInTheDocument();
    });

    it('falls back to the email when the user has no name', () => {
        renderWithProviders(
            <UserAccessMultiSelect
                projectUuid="project-1"
                value={['user-2']}
                onChange={() => {}}
                selectedUserDetails={[
                    {
                        userUuid: 'user-2',
                        firstName: '',
                        lastName: '',
                        email: 'nameless@example.com',
                    },
                ]}
            />,
        );

        expect(screen.getByText('nameless@example.com')).toBeInTheDocument();
    });
});
