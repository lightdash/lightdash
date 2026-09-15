import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { BASE_API_URL } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import InviteLinkExpirationPanel from './InviteLinkExpirationPanel';

describe('InviteLinkExpirationPanel', () => {
    it('persists the organization invite link expiration', async () => {
        const user = userEvent.setup();
        const settingsRead = nock(BASE_API_URL)
            .get('/api/v1/org/settings')
            .reply(200, {
                status: 'ok',
                results: { inviteLinkExpirationDays: 3 },
            });
        const settingsUpdate = nock(BASE_API_URL)
            .patch('/api/v1/org/settings', {
                inviteLinkExpirationDays: 7,
            })
            .reply(200, {
                status: 'ok',
                results: { inviteLinkExpirationDays: 7 },
            });
        const settingsRefetch = nock(BASE_API_URL)
            .get('/api/v1/org/settings')
            .reply(200, {
                status: 'ok',
                results: { inviteLinkExpirationDays: 7 },
            });

        renderWithProviders(<InviteLinkExpirationPanel />);

        const expirationSelect = await screen.findByRole('combobox', {
            name: 'Invite link expiration',
        });
        await user.click(expirationSelect);
        await user.click(await screen.findByText('7 days'));

        await waitFor(() => expect(settingsUpdate.isDone()).toBe(true));
        expect(settingsRead.isDone()).toBe(true);
        expect(settingsRefetch.isDone()).toBe(true);
    });
});
