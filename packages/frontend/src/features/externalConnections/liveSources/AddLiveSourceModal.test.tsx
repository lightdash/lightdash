import { ApiConnectorType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { EventName } from '../../../types/Events';
import { AddLiveSourceModal } from './AddLiveSourceModal';

const { track, resultsCacheStatus } = vi.hoisted(() => ({
    track: vi.fn(),
    resultsCacheStatus: vi.fn(),
}));

vi.mock('../../../hooks/useProjectResultsCacheSettings', () => ({
    useResultsCacheStatus: resultsCacheStatus,
}));

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

const renderModal = ({
    canUseLinkedInAds = true,
    canUseSalesforce = true,
    canUseHydra = false,
    enabledIntegrations = Object.values(ApiConnectorType),
} = {}) =>
    renderWithProviders(
        <MemoryRouter>
            <AddLiveSourceModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
                canUseGoogle
                canUseLinkedInAds={canUseLinkedInAds}
                canUseSalesforce={canUseSalesforce}
                canUseHydra={canUseHydra}
                enabledIntegrations={enabledIntegrations}
                onPick={onPick}
            />
        </MemoryRouter>,
    );

const openRequest = () =>
    userEvent.click(
        screen.getByRole('button', { name: 'Request a live data source' }),
    );

const customInput = () => screen.getByRole('textbox', { name: 'Source name' });

const customRequestButton = () =>
    screen.getByRole('button', { name: 'Request' });

describe('AddLiveSourceModal', () => {
    beforeEach(() => {
        track.mockClear();
        onPick.mockClear();
        resultsCacheStatus.mockReturnValue({ data: { enabled: true } });
    });

    it('leaves the caching warning to source settings', () => {
        resultsCacheStatus.mockReturnValue({ data: { enabled: false } });
        renderModal();
        expect(
            screen.queryByText(/Caching is off for this project/),
        ).not.toBeInTheDocument();
    });

    it('lists only integrations this instance can connect', () => {
        renderModal({ canUseLinkedInAds: false, canUseSalesforce: false });

        expect(screen.queryByText('LinkedIn Ads')).not.toBeInTheDocument();
        expect(screen.queryByText('Salesforce')).not.toBeInTheDocument();
        expect(screen.queryByText('Jira')).not.toBeInTheDocument();
        expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
        expect(screen.getByText('PostHog')).toBeInTheDocument();
        // Hydra, the test integration, only where the server registers it
        expect(screen.queryByText('Hydra')).not.toBeInTheDocument();
    });

    it('hides integrations the organization has turned off', () => {
        renderModal({
            enabledIntegrations: Object.values(ApiConnectorType).filter(
                (connector) => connector !== ApiConnectorType.HUBSPOT,
            ),
        });

        expect(screen.queryByText('HubSpot')).not.toBeInTheDocument();
        expect(screen.getByText('PostHog')).toBeInTheDocument();
    });

    it('offers Hydra where the server registers it', async () => {
        renderModal({ canUseHydra: true });

        await userEvent.click(screen.getByText('Hydra'));

        expect(onPick).toHaveBeenCalledWith('hydra');
    });

    it('asks for a source name only after Request a live data source is clicked', async () => {
        renderModal();

        expect(
            screen.queryByRole('textbox', { name: 'Source name' }),
        ).not.toBeInTheDocument();
        await openRequest();
        expect(customInput()).toBeInTheDocument();
    });

    it('connects LinkedIn Ads when the server has a LinkedIn client', async () => {
        renderModal();

        await userEvent.click(screen.getByText('LinkedIn Ads'));

        expect(onPick).toHaveBeenCalledWith('linkedin_ads');
    });

    it('tracks a typed source by its trimmed name', async () => {
        renderModal();
        await openRequest();

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
        await openRequest();

        await userEvent.type(customInput(), 'Hubspot{Enter}');

        expect(track).toHaveBeenCalledOnce();
    });

    it('confirms the request and starts the next one empty', async () => {
        renderModal();
        await openRequest();

        await userEvent.type(customInput(), 'Hubspot{Enter}');

        expect(screen.getByRole('status')).toHaveTextContent(
            'Requested Hubspot. Thanks!',
        );
        // The confirmation closes by itself and the button comes back
        await userEvent.click(
            await screen.findByRole(
                'button',
                { name: 'Request a live data source' },
                { timeout: 4000 },
            ),
        );
        expect(customInput()).toHaveValue('');
    });

    it('closes the input on Escape and hands focus back', async () => {
        renderModal();
        await openRequest();

        await userEvent.type(customInput(), 'Hubspot{Escape}');

        expect(
            screen.getByRole('button', { name: 'Request a live data source' }),
        ).toHaveFocus();
        expect(track).not.toHaveBeenCalled();
    });

    it.each(['', '   '])(
        'does not request a source named %j',
        async (sourceName) => {
            renderModal();
            await openRequest();

            if (sourceName !== '') {
                await userEvent.type(customInput(), sourceName);
            }
            await userEvent.type(customInput(), '{Enter}');

            expect(customRequestButton()).toBeDisabled();
            expect(track).not.toHaveBeenCalled();
        },
    );

    it('still opens setup for an available source', async () => {
        renderModal();

        await userEvent.click(screen.getByRole('button', { name: /PostHog/ }));

        expect(onPick).toHaveBeenCalledOnce();
        expect(track).not.toHaveBeenCalled();
    });
});
