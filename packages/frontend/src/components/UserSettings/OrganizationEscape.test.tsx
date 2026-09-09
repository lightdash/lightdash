import { OrganizationMemberRole } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { OrganizationDeleteModal } from './DeleteOrganizationPanel/DeleteOrganizationModal';
import { LeaveOrganizationPanel } from './LeaveOrganizationPanel';
import { LeaveOrganizationModal } from './LeaveOrganizationPanel/LeaveOrganizationModal';

const user = {
    userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    role: OrganizationMemberRole.ADMIN,
};

const mockOrganization = (name: string) =>
    nock(BASE_API_URL)
        .get('/api/v1/org')
        .reply(200, {
            status: 'ok',
            results: { name, organizationUuid: user.organizationUuid },
        });

describe('organization escape', () => {
    it.each(['', '   '])(
        'requires DELETE to delete an unnamed organization (%j)',
        async (name) => {
            mockOrganization(name);
            const onClose = vi.fn();
            renderWithProviders(
                <OrganizationDeleteModal opened onClose={onClose} />,
            );

            const input = await screen.findByRole('textbox', {
                name: 'Type DELETE to confirm',
            });
            const confirm = screen.getByRole('button', {
                name: 'Permanently delete organization',
            });
            expect(confirm).toBeDisabled();
            expect(
                screen.getByText(
                    /all projects, saved content, users, and service accounts/,
                ),
            ).toBeInTheDocument();
            fireEvent.change(input, { target: { value: 'wrong' } });
            expect(confirm).toBeDisabled();
            fireEvent.change(input, { target: { value: 'DELETE' } });
            expect(confirm).toBeEnabled();

            const deletion = nock(BASE_API_URL)
                .delete(`/api/v1/org/${user.organizationUuid}`)
                .reply(200, { status: 'ok' });
            fireEvent.click(confirm);
            await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
            expect(deletion.isDone()).toBe(true);
        },
    );

    it('requires the name for a named organization and clears confirmation on cancel', async () => {
        mockOrganization('Jaffle Shop');
        const onClose = vi.fn();
        renderWithProviders(
            <OrganizationDeleteModal opened onClose={onClose} />,
        );
        const input = await screen.findByRole('textbox', {
            name: 'Type Jaffle Shop to confirm',
        });
        const confirm = screen.getByRole('button', {
            name: 'Permanently delete organization',
        });
        fireEvent.change(input, { target: { value: 'DELETE' } });
        expect(confirm).toBeDisabled();
        fireEvent.change(input, { target: { value: 'jaffle shop' } });
        expect(confirm).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(input).toHaveValue('');
        expect(confirm).toBeDisabled();
    });

    it('requires LEAVE for an unnamed organization and calls only the leave endpoint', async () => {
        mockOrganization('');
        const onClose = vi.fn();
        renderWithProviders(
            <LeaveOrganizationModal opened onClose={onClose} />,
        );
        const input = await screen.findByRole('textbox', {
            name: 'Type LEAVE to confirm',
        });
        const confirm = screen.getByRole('button', {
            name: 'Leave',
        });
        expect(confirm).toBeDisabled();
        fireEvent.change(input, { target: { value: 'DELETE' } });
        expect(confirm).toBeDisabled();
        fireEvent.change(input, { target: { value: 'LEAVE' } });
        expect(confirm).toBeEnabled();
        const leaving = nock(BASE_API_URL)
            .delete('/api/v1/user/me/leaveOrganization')
            .reply(200, { status: 'ok', results: null });
        fireEvent.click(confirm);
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(leaving.isDone()).toBe(true);
    });

    it.each([
        { members: [user], explanation: /You are the only member/ },
        {
            members: [
                user,
                {
                    ...user,
                    userUuid: 'another-member',
                    role: OrganizationMemberRole.MEMBER,
                },
            ],
            explanation: /You are the only admin/,
        },
    ])(
        'explains the blocked leave action for $members.length members and opens deletion',
        async ({ members, explanation }) => {
            mockOrganization('');
            nock(BASE_API_URL)
                .get('/api/v1/org/users')
                .reply(200, {
                    status: 'ok',
                    results: { data: members },
                });
            renderWithProviders(<LeaveOrganizationPanel />, {
                user: {
                    abilityRules: [
                        { action: 'delete', subject: 'Organization' },
                    ],
                },
            });
            expect(
                await screen.findByRole('button', {
                    name: "Leave 'Unnamed organization'",
                }),
            ).toBeDisabled();
            expect(screen.getByText(explanation)).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', {
                    name: "Delete 'Unnamed organization'",
                }),
            );
            expect(
                await screen.findByRole('textbox', {
                    name: 'Type DELETE to confirm',
                }),
            ).toBeInTheDocument();
        },
    );

    it('does not offer organization deletion to a non-admin', async () => {
        mockOrganization('Jaffle Shop');
        renderWithProviders(<LeaveOrganizationPanel />, {
            user: { role: OrganizationMemberRole.MEMBER, abilityRules: [] },
        });
        expect(
            await screen.findByRole('button', { name: "Leave 'Jaffle Shop'" }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: /Delete/ }),
        ).not.toBeInTheDocument();
    });
});
