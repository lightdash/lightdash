import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LinearReviewSettings } from './LinearReviewSettings';
import { buildLinearAppSetupUrl } from './linearReviewSettingsUtils';

const mocks = vi.hoisted(() => ({
    deleteLinear: vi.fn(),
    updateDestination: vi.fn(),
}));

vi.mock('../../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { siteUrl: 'https://app.example.com' } },
        user: { data: { ability: { can: () => true } } },
    }),
}));

vi.mock('../../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [{ projectUuid: 'project-1', name: 'Jaffle shop' }],
        isInitialLoading: false,
    }),
}));

vi.mock(
    '../../../../../../components/common/LinearIntegration/hooks/useLinearIntegration',
    () => ({
        useDeleteLinearInstallationMutation: () => ({
            mutate: mocks.deleteLinear,
            isLoading: false,
        }),
        useLinearInstallation: () => ({
            data: undefined,
            isInitialLoading: false,
        }),
        useLinearProjects: () => ({ data: [], isInitialLoading: false }),
        useLinearTeams: () => ({ data: [], isInitialLoading: false }),
    }),
);

vi.mock('../../../hooks/useReviewNotificationSettings', () => ({
    useReviewLinearDestination: () => ({
        data: undefined,
        isInitialLoading: false,
    }),
    useUpdateReviewLinearDestination: () => ({
        mutate: mocks.updateDestination,
        isLoading: false,
    }),
}));

const renderSettings = (initialEntry = '/generalSettings/ai/general') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
                <LinearReviewSettings />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('LinearReviewSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prefills the self-hosted OAuth app and requires only its public client ID', async () => {
        const setupUrl = new URL(
            buildLinearAppSetupUrl('https://app.example.com'),
        );
        expect(setupUrl.origin + setupUrl.pathname).toBe(
            'https://linear.app/settings/api/applications/new',
        );
        expect(setupUrl.searchParams.get('oauth.redirect_uris')).toBe(
            'https://app.example.com/api/v1/linear/oauth/callback',
        );

        const user = userEvent.setup();
        renderSettings();
        const connect = screen.getByRole('button', {
            name: 'Connect Linear',
        });
        expect(connect).toBeDisabled();
        await user.type(
            screen.getByLabelText('Linear OAuth client ID'),
            'client-1',
        );
        expect(connect).toBeEnabled();
    });

    it('discloses that issue creation is one-way', () => {
        renderSettings();

        expect(screen.getByText(/This is a one-way export/)).toBeVisible();
    });
});
