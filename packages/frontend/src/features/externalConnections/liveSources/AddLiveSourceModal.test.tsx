import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { EventName } from '../../../types/Events';
import { AddLiveSourceModal } from './AddLiveSourceModal';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: { data: { organizationUuid: 'org-1' } },
    }),
}));

const onPick = vi.fn();

const renderModal = ({ canUseLinkedInAds = true } = {}) =>
    renderWithProviders(
        <AddLiveSourceModal
            opened
            onClose={vi.fn()}
            projectUuid="project-1"
            canUseGoogle
            canUseLinkedInAds={canUseLinkedInAds}
            onPick={onPick}
        />,
    );

const customCard = () => {
    const form = screen
        .getByRole('textbox', { name: 'Source name' })
        .closest('form');
    if (form === null) {
        throw new Error('Custom source form not found');
    }
    return within(form);
};

const customInput = () => screen.getByRole('textbox', { name: 'Source name' });

const customRequestButton = () =>
    customCard().getByRole('button', { name: 'Request' });

describe('AddLiveSourceModal', () => {
    beforeEach(() => {
        track.mockClear();
        onPick.mockClear();
    });

    it('shows LinkedIn Ads as requestable without a LinkedIn client', async () => {
        renderModal({ canUseLinkedInAds: false });

        const requestButtons = screen.getAllByRole('button', {
            name: 'Request',
        });
        expect(screen.getByText('LinkedIn Ads')).toBeInTheDocument();
        await userEvent.click(requestButtons[0]);

        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                name: EventName.LIVE_DATA_SOURCE_REQUESTED,
                properties: expect.objectContaining({
                    integration: 'linkedin_ads',
                }),
            }),
        );
        expect(onPick).not.toHaveBeenCalled();
    });

    it('connects LinkedIn Ads when the server has a LinkedIn client', async () => {
        renderModal();

        await userEvent.click(screen.getByText('LinkedIn Ads'));

        expect(onPick).toHaveBeenCalledWith('linkedin_ads');
    });

    it('tracks a typed source by its trimmed name', async () => {
        renderModal();

        await userEvent.type(customInput(), '  Hubspot  ');
        await userEvent.click(customRequestButton());

        expect(track).toHaveBeenCalledExactlyOnceWith({
            name: EventName.LIVE_DATA_SOURCE_REQUESTED,
            properties: {
                organizationId: 'org-1',
                projectId: 'project-1',
                integration: 'custom',
                customIntegrationName: 'Hubspot',
            },
        });
    });

    it('requests a typed source when Enter is pressed', async () => {
        renderModal();

        await userEvent.type(customInput(), 'Hubspot{Enter}');

        expect(track).toHaveBeenCalledOnce();
    });

    it('clears the input and confirms the request so another can be added', async () => {
        renderModal();

        await userEvent.type(customInput(), 'Hubspot{Enter}');

        expect(customInput()).toHaveValue('');
        expect(screen.getByText('Requested Hubspot')).toBeInTheDocument();
    });

    it.each(['', '   '])(
        'does not request a source named %j',
        async (sourceName) => {
            renderModal();

            if (sourceName !== '') {
                await userEvent.type(customInput(), sourceName);
            }
            await userEvent.type(customInput(), '{Enter}');

            expect(customRequestButton()).toBeDisabled();
            expect(track).not.toHaveBeenCalled();
        },
    );

    it('tracks a catalog request by its id, without a custom name', async () => {
        renderModal();

        const jiraCard = screen.getByText('Jira').closest('[data-requestable]');
        if (!(jiraCard instanceof HTMLElement)) {
            throw new Error('Jira card not found');
        }
        await userEvent.click(
            within(jiraCard).getByRole('button', { name: 'Request' }),
        );

        expect(track).toHaveBeenCalledExactlyOnceWith({
            name: EventName.LIVE_DATA_SOURCE_REQUESTED,
            properties: {
                organizationId: 'org-1',
                projectId: 'project-1',
                integration: 'jira',
            },
        });
    });

    it('still opens setup for an available source', async () => {
        renderModal();

        await userEvent.click(screen.getByRole('button', { name: /PostHog/ }));

        expect(onPick).toHaveBeenCalledOnce();
        expect(track).not.toHaveBeenCalled();
    });
});
