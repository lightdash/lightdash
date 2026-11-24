import { ApiConnectorType, POSTHOG_REGION_ORIGINS } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type LiveSourceConnection } from './liveSourceRows';
import { LiveSourceSettings } from './LiveSourceSettings';

const { update, idle } = vi.hoisted(() => ({
    update: vi.fn(),
    idle: () => ({ mutate: vi.fn(), isLoading: false, data: undefined }),
}));

vi.mock('../hooks/useUpdateExternalConnection', () => ({
    LIVE_SOURCE_UPDATE_MESSAGES: {},
    useUpdateExternalConnection: () => ({
        mutateAsync: update,
        isLoading: false,
    }),
}));
vi.mock('../hooks/useLiveSourceFields', () => ({
    useLiveSourceFields: () => ({ data: undefined }),
    useRefreshLiveSourceFields: idle,
}));
vi.mock('../hooks/useLiveSourceCache', () => ({
    usePurgeLiveSourceCache: idle,
    useUpdateLiveSourceCache: idle,
}));
vi.mock('../hooks/useTestConnection', () => ({
    useTestConnection: idle,
}));
vi.mock('../hooks/useTestConnectionConfig', () => ({
    useTestConnectionConfig: idle,
}));
vi.mock('../../../hooks/useProjectResultsCacheSettings', () => ({
    useResultsCacheStatus: () => ({ data: undefined }),
}));
vi.mock('./LiveSourceRateLimits', () => ({
    LiveSourceRateLimitsCard: () => null,
}));

const euKeySource = {
    externalConnectionUuid: 'connection-1',
    name: 'PostHog',
    kind: 'live_source',
    type: 'bearer_token',
    origin: POSTHOG_REGION_ORIGINS.eu,
    aiHint: null,
    apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
} as unknown as LiveSourceConnection;

/** The Access card's own Save changes; the Details card has one too. */
const saveAccess = () => {
    const card = screen.getByText('US Cloud').closest('form');
    if (!card) throw new Error('The Access card is not a form');
    return within(card).getByRole('button', { name: 'Save changes' });
};

const renderSettings = () =>
    renderWithProviders(
        <LiveSourceSettings
            projectUuid="project-1"
            connection={euKeySource}
            reconnect={null}
            onDelete={vi.fn()}
        />,
    );

describe('LiveSourceSettings PostHog access', () => {
    beforeEach(() => {
        update.mockReset();
        update.mockResolvedValue({});
    });

    it('saves a new region, project and key in one request', async () => {
        const user = userEvent.setup();
        renderSettings();

        await user.click(screen.getByText('US Cloud'));
        const project = screen.getByRole('textbox', { name: 'Project ID' });
        await user.clear(project);
        await user.type(project, '99');
        await user.type(
            screen.getByLabelText('New Personal API key'),
            'phx_us',
        );
        await user.click(saveAccess());

        expect(update).toHaveBeenCalledExactlyOnceWith({
            projectUuid: 'project-1',
            connectionUuid: 'connection-1',
            data: expect.objectContaining({
                origin: POSTHOG_REGION_ORIGINS.us,
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '99',
                },
                secret: 'phx_us',
            }),
        });
    });

    it('asks for a new key instead of moving the saved one to another region', async () => {
        const user = userEvent.setup();
        renderSettings();

        await user.click(screen.getByText('US Cloud'));
        await user.click(saveAccess());

        expect(update).not.toHaveBeenCalled();
        expect(
            screen.getByText('Enter a key for the new region'),
        ).toBeInTheDocument();
    });

    it('keeps the saved key when its field is left empty', async () => {
        const user = userEvent.setup();
        renderSettings();

        const project = screen.getByRole('textbox', { name: 'Project ID' });
        await user.clear(project);
        await user.type(project, '99');
        await user.click(saveAccess());

        expect(update).toHaveBeenCalledOnce();
        expect(update.mock.calls[0][0].data).not.toHaveProperty('secret');
    });
});
