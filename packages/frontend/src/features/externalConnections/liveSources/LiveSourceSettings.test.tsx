import { ApiConnectorType, POSTHOG_REGION_ORIGINS } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type LiveSourceConnection } from './liveSourceRows';
import { LiveSourceSettings } from './LiveSourceSettings';

const { update, idle } = vi.hoisted(() => ({
    update: vi.fn(),
    idle: () => ({
        mutate: vi.fn(),
        isLoading: false,
        data: undefined,
        reset: vi.fn(),
    }),
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
vi.mock('../hooks/useExternalConnectionApiUsage', () => ({
    useExternalConnectionApiUsage: () => ({ data: undefined }),
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

const renderSettings = () =>
    renderWithProviders(
        <LiveSourceSettings
            projectUuid="project-1"
            connection={euKeySource}
            reconnect={null}
            onDelete={vi.fn()}
        />,
    );

/** Opens the dialog that edits Authentication, and returns it. */
const editAuthentication = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
        screen.getByRole('button', { name: 'Edit Authentication' }),
    );
    return within(await screen.findByRole('dialog'));
};

describe('LiveSourceSettings PostHog authentication', () => {
    beforeEach(() => {
        update.mockReset();
        update.mockResolvedValue({});
    });

    it('reads on the page, and edits in a dialog that Cancel reverts', async () => {
        const user = userEvent.setup();
        renderSettings();

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        const dialog = await editAuthentication(user);
        const project = dialog.getByRole('textbox', { name: 'Project ID' });
        expect(
            dialog.getByRole('button', { name: 'Save changes' }),
        ).toBeDisabled();
        await user.type(project, '9');
        expect(
            dialog.getByRole('button', { name: 'Save changes' }),
        ).toBeEnabled();
        await user.click(dialog.getByRole('button', { name: 'Cancel' }));

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('saves a new region, project and key in one request', async () => {
        const user = userEvent.setup();
        renderSettings();
        const dialog = await editAuthentication(user);

        await user.click(dialog.getByText('US Cloud'));
        const project = dialog.getByRole('textbox', { name: 'Project ID' });
        await user.clear(project);
        await user.type(project, '99');
        await user.type(
            dialog.getByLabelText('New Personal API key'),
            'phx_us',
        );
        await user.click(dialog.getByRole('button', { name: 'Save changes' }));

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
        const dialog = await editAuthentication(user);

        await user.click(dialog.getByText('US Cloud'));
        await user.click(dialog.getByRole('button', { name: 'Save changes' }));

        expect(update).not.toHaveBeenCalled();
        expect(
            dialog.getByText('Enter a key for the new region'),
        ).toBeInTheDocument();
    });

    it('keeps the saved key when its field is left empty', async () => {
        const user = userEvent.setup();
        renderSettings();
        const dialog = await editAuthentication(user);

        const project = dialog.getByRole('textbox', { name: 'Project ID' });
        await user.clear(project);
        await user.type(project, '99');
        await user.click(dialog.getByRole('button', { name: 'Save changes' }));

        expect(update).toHaveBeenCalledOnce();
        expect(update.mock.calls[0][0].data).not.toHaveProperty('secret');
    });
});
