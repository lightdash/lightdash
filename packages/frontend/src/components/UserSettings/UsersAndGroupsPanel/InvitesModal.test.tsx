import {
    type LightdashUserWithAbilityRules,
    OrganizationMemberRole,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../../api';
import { renderWithProviders } from '../../../testing/testUtils';
import InvitesModal from './InvitesModal';

const renderModal = (
    abilityRules: LightdashUserWithAbilityRules['abilityRules'],
) =>
    renderWithProviders(<InvitesModal opened onClose={vi.fn()} />, {
        user: {
            role: OrganizationMemberRole.ADMIN,
            abilityRules,
        },
    });

describe('InvitesModal', () => {
    it('creates invites without a client expiry', async () => {
        const user = userEvent.setup();
        const settingsRead = nock(BASE_API_URL)
            .get('/api/v1/org/settings')
            .reply(200, {
                status: 'ok',
                results: { inviteLinkExpirationDays: 7 },
            });
        const inviteCreate = nock(BASE_API_URL)
            .post('/api/v1/invite-links', (body) => {
                expect(body.email).toBe('new-user@example.com');
                expect(body).not.toHaveProperty('expiresAt');
                return true;
            })
            .reply(200, {
                status: 'ok',
                results: {
                    email: 'new-user@example.com',
                    expiresAt: '2026-09-22T12:00:00.000Z',
                    inviteCode: 'invite-code',
                    inviteUrl: 'http://localhost/invite/invite-code',
                    organizationUuid: 'organization-uuid',
                    userUuid: 'user-uuid',
                    purpose: 'member',
                },
            });

        renderModal([
            { action: 'manage', subject: 'Organization' },
            { action: 'create', subject: 'InviteLink' },
        ]);

        expect(
            await screen.findByText(
                'New invite links expire after 7 days. You can change this in General settings.',
            ),
        ).toBeInTheDocument();

        const emailInput = screen.getByRole('textbox', {
            name: 'Enter user email address',
        });
        await user.type(emailInput, 'new-user@example.com');
        expect(emailInput).toHaveValue('new-user@example.com');
        fireEvent.submit(document.querySelector('#invite_user')!);

        await waitFor(() => expect(inviteCreate.isDone()).toBe(true));
        expect(settingsRead.isDone()).toBe(true);
    });
});
