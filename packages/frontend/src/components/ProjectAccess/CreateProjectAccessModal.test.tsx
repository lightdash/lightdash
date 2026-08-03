import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import CreateProjectAccessModal from './CreateProjectAccessModal';

const EXISTING_MEMBER = {
    userUuid: 'c1f0f0a1-1111-4111-8111-111111111111',
    email: 'member@lightdash.com',
};
const INVITED_USER_UUID = 'd2f0f0a1-2222-4222-8222-222222222222';

const { upsertMock, inviteMock } = vi.hoisted(() => ({
    upsertMock: vi.fn(),
    inviteMock: vi.fn(),
}));

const ORG_USERS = [
    { userUuid: EXISTING_MEMBER.userUuid, email: EXISTING_MEMBER.email },
];

vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: ORG_USERS }),
}));

vi.mock('../../hooks/useProjectRoles', () => ({
    useUpsertProjectUserRoleAssignmentMutation: () => ({
        mutateAsync: upsertMock,
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useInviteLink', () => ({
    useCreateInviteLinkMutation: () => ({
        mutateAsync: inviteMock,
        isLoading: false,
        reset: vi.fn(),
    }),
}));

const ROLES = [{ value: 'viewer', label: 'Viewer', group: 'System role' }];

const renderModal = () =>
    renderWithProviders(
        <CreateProjectAccessModal
            projectUuid="e3f0f0a1-3333-4333-8333-333333333333"
            roles={ROLES}
            onClose={vi.fn()}
        />,
    );

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Give access' }));
};

describe('CreateProjectAccessModal', () => {
    beforeEach(() => {
        upsertMock.mockReset().mockResolvedValue(undefined);
        inviteMock
            .mockReset()
            .mockResolvedValue({ userUuid: INVITED_USER_UUID });
    });

    it('assigns the role directly when an existing member is selected', async () => {
        const user = userEvent.setup();
        renderModal();

        const emailInput = screen.getByRole('textbox', {
            name: 'Enter user email address',
        });
        await user.click(emailInput);
        await user.click(await screen.findByText(EXISTING_MEMBER.email));

        await submit(user);

        await waitFor(() =>
            expect(upsertMock).toHaveBeenCalledWith({
                userId: EXISTING_MEMBER.userUuid,
                roleId: 'viewer',
                sendEmail: true,
            }),
        );
        expect(inviteMock).not.toHaveBeenCalled();
    });

    it('invites a non-member first and assigns the role to the created user', async () => {
        const user = userEvent.setup();
        renderModal();

        const emailInput = screen.getByRole('textbox', {
            name: 'Enter user email address',
        });
        await user.click(emailInput);
        await user.type(emailInput, 'newcomer@example.com');
        await user.click(
            await screen.findByText(/Select to invite them\./, {
                exact: false,
            }),
        );

        await submit(user);

        await waitFor(() =>
            expect(inviteMock).toHaveBeenCalledWith({
                email: 'newcomer@example.com',
                role: 'member',
            }),
        );
        expect(upsertMock).toHaveBeenCalledWith({
            userId: INVITED_USER_UUID,
            roleId: 'viewer',
            sendEmail: false,
        });
    });
});
