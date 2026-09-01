import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LinearReviewSettings } from './LinearReviewSettings';
import { buildLinearAppSetupUrl } from './linearReviewSettingsUtils';

const mocks = vi.hoisted(() => ({
    deleteLinear: vi.fn(),
    updateRouting: vi.fn(),
    backfillLinear: vi.fn(),
    hasLinear: false,
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
        useLinearInstallation: () => ({
            data: mocks.hasLinear
                ? {
                      organizationName: 'Example',
                      organizationUrlKey: 'example',
                      requiresReconnect: false,
                  }
                : undefined,
            isInitialLoading: false,
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
        mocks.routing = {
            organizationUuid: 'org-1',
            applyToAllProjects: true,
            projectUuids: [],
            enabled: true,
            linearTeamId: 'team-1',
            linearProjectId: null,
        };
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
