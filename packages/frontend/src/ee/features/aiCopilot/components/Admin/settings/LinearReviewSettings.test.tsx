import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LinearReviewSettings } from './LinearReviewSettings';
import { buildLinearAppSetupUrl } from './linearReviewSettingsUtils';

const mocks = vi.hoisted(() => ({
    deleteLinear: vi.fn(),
    installLinear: vi.fn(),
    updateRouting: vi.fn(),
    backfillLinear: vi.fn(),
    hasLinear: false,
    requiresClientSecret: false,
    installationLoading: false,
    routing: {
        organizationUuid: 'org-1',
        applyToAllProjects: true,
        projectUuids: [] as string[],
        enabled: true,
        linearTeamId: 'team-1',
        linearProjectId: null as string | null,
    },
}));

vi.mock('../../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { siteUrl: 'https://app.example.com' } },
        user: { data: { ability: { can: () => true } } },
    }),
}));

vi.mock('../../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [
            { projectUuid: 'project-1', name: 'Jaffle shop' },
            { projectUuid: 'project-2', name: 'Analytics' },
        ],
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
        useInstallLinear: () => ({
            mutate: mocks.installLinear,
            isLoading: false,
        }),
        useLinearInstallation: () => ({
            data: mocks.hasLinear
                ? {
                      organizationName: 'Example',
                      organizationUrlKey: 'example',
                      requiresReconnect: false,
                      requiresClientSecret: mocks.requiresClientSecret,
                  }
                : undefined,
            isInitialLoading: mocks.installationLoading,
        }),
        useLinearProjects: () => ({ data: [], isInitialLoading: false }),
        useLinearTeams: () => ({
            data: [{ id: 'team-1', name: 'Analytics Engineering', key: 'AE' }],
            isInitialLoading: false,
        }),
    }),
);

vi.mock('../../../hooks/useReviewNotificationSettings', () => ({
    useReviewLinearRouting: () => ({
        data: mocks.hasLinear ? mocks.routing : undefined,
        isInitialLoading: false,
    }),
    useUpdateReviewLinearRouting: () => ({
        mutate: mocks.updateRouting,
        isLoading: false,
    }),
    useBackfillReviewLinearIssues: () => ({
        mutate: mocks.backfillLinear,
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
        mocks.hasLinear = false;
        mocks.requiresClientSecret = false;
        mocks.routing = {
            organizationUuid: 'org-1',
            applyToAllProjects: true,
            projectUuids: [],
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: null,
        };
        mocks.installationLoading = false;
    });

    it('prefills the self-hosted OAuth app and connects with its client ID and secret', async () => {
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
        await user.type(screen.getByLabelText('Client ID'), ' client-1 ');
        expect(connect).toBeDisabled();
        await user.type(screen.getByLabelText('Client secret'), 'secret-1');
        expect(connect).toBeEnabled();

        await user.click(connect);
        expect(mocks.installLinear).toHaveBeenCalledWith({
            clientId: 'client-1',
            clientSecret: 'secret-1',
        });
    });

    it('asks an install saved without a client secret to reconnect while keeping its settings', () => {
        mocks.hasLinear = true;
        mocks.requiresClientSecret = true;
        renderSettings();

        expect(
            screen.getByText('Add the client secret to keep exporting issues'),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Client secret')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Reconnect Linear' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Reconnect' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('All projects')).toBeInTheDocument();
    });

    it('offers the saved-credentials reconnect link once the secret is stored', () => {
        mocks.hasLinear = true;
        renderSettings();

        expect(
            screen.queryByText(
                'Add the client secret to keep exporting issues',
            ),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Reconnect' }),
        ).toBeInTheDocument();
    });

    it('explains a failed connection and lets the user dismiss it', async () => {
        const user = userEvent.setup();
        renderSettings(
            '/generalSettings/ai/general?linearError=invalid_client',
        );

        expect(screen.getByText("Couldn't connect Linear")).toBeInTheDocument();
        expect(
            screen.getByText(
                /Linear did not accept the client ID or client secret/,
            ),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(
            screen.queryByText("Couldn't connect Linear"),
        ).not.toBeInTheDocument();
    });

    it('ignores an unknown connection error value', () => {
        renderSettings('/generalSettings/ai/general?linearError=<script>');

        expect(
            screen.queryByText("Couldn't connect Linear"),
        ).not.toBeInTheDocument();
    });

    it('does not show the setup steps while the installation is loading', () => {
        mocks.installationLoading = true;
        renderSettings();

        expect(
            screen.queryByText('Create a Linear app'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('switch', {
                name: 'Create Linear issues for AI review findings',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows a two-step Linear setup with the Linear logo', () => {
        renderSettings();

        expect(screen.getByRole('img', { name: 'Linear' })).toBeVisible();
        expect(screen.getByText('Create a Linear app')).toBeVisible();
        expect(
            screen.getByText('Paste the client credentials and connect'),
        ).toBeVisible();
        expect(screen.getByText(/Status is not synced/)).toBeVisible();
        expect(
            screen.queryByRole('switch', {
                name: 'Create Linear issues for AI review findings',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows the Linear logo and export toggle when connected', () => {
        mocks.hasLinear = true;
        renderSettings();

        expect(screen.getByRole('img', { name: 'Linear' })).toBeVisible();
        expect(
            screen.getByRole('switch', {
                name: 'Create Linear issues for AI review findings',
            }),
        ).toBeChecked();
        expect(screen.getByText(/Connected to Example/)).toBeVisible();
    });

    it('exports existing findings when Linear is already connected', async () => {
        mocks.hasLinear = true;
        const user = userEvent.setup();
        renderSettings();

        await user.click(
            screen.getByRole('button', {
                name: 'Create issues for existing findings',
            }),
        );

        expect(mocks.backfillLinear).toHaveBeenCalled();
    });

    it('lets admins send findings from every project', async () => {
        mocks.hasLinear = true;
        const user = userEvent.setup();
        renderSettings();

        expect(screen.getByLabelText('All projects')).toBeChecked();
        expect(
            screen.queryByLabelText('Lightdash projects'), // pragma: allowlist secret
        ).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('All projects'));

        expect(mocks.updateRouting).toHaveBeenCalledWith({
            applyToAllProjects: false,
            projectUuids: ['project-1', 'project-2'],
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: null,
        });
    });
});
