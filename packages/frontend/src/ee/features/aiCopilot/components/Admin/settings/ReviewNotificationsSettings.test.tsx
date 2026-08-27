import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ReviewNotificationsSettings } from './ReviewNotificationsSettings';

const mocks = vi.hoisted(() => ({
    deleteLinear: vi.fn(),
    updateSettings: vi.fn(),
}));

vi.mock('../../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { siteUrl: 'https://app.example.com' } },
        user: { data: { ability: { can: () => true } } },
    }),
}));

vi.mock('../../../../../../hooks/slack/useSlack', () => ({
    useGetSlack: () => ({ data: undefined }),
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
        useLinearProjects: () => ({
            data: [],
            isInitialLoading: false,
        }),
        useLinearTeams: () => ({
            data: [],
            isInitialLoading: false,
        }),
    }),
);

vi.mock('../../../hooks/useReviewNotificationSettings', () => ({
    useReviewNotificationSettings: () => ({
        data: {
            organizationUuid: 'org-1',
            enabled: false,
            slackChannelId: null,
            linearEnabled: false,
            linearTeamId: null,
            linearProjectId: null,
        },
        isInitialLoading: false,
    }),
    useUpdateReviewNotificationSettings: () => ({
        mutate: mocks.updateSettings,
        isLoading: false,
    }),
}));

describe('ReviewNotificationsSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sets up org-scoped Linear OAuth without an API key or secret', async () => {
        const user = userEvent.setup();
        render(
            <MantineProvider>
                <MemoryRouter>
                    <ReviewNotificationsSettings />
                </MemoryRouter>
            </MantineProvider>,
        );

        const setupLink = screen.getByRole('link', {
            name: 'Create Linear app',
        }) as HTMLAnchorElement;
        const setupUrl = new URL(setupLink.href);
        expect(setupUrl.origin + setupUrl.pathname).toBe(
            'https://linear.app/settings/api/applications/new',
        );
        expect(setupUrl.searchParams.get('oauth.redirect_uris')).toBe(
            'https://app.example.com/api/v1/linear/oauth/callback',
        );

        const input = screen.getByLabelText('Linear OAuth client ID');
        const connect = screen.getByRole('button', {
            name: 'Connect Linear',
        });
        expect(connect).toBeDisabled();

        await user.type(input, 'client-1');
        expect(connect).toBeEnabled();
    });

    it('clears a stale destination after connecting a different workspace', async () => {
        render(
            <MantineProvider>
                <MemoryRouter
                    initialEntries={[
                        '/generalSettings/ai/general?linearWorkspaceChanged=true',
                    ]}
                >
                    <ReviewNotificationsSettings />
                </MemoryRouter>
            </MantineProvider>,
        );

        await waitFor(() =>
            expect(mocks.updateSettings).toHaveBeenCalledWith({
                enabled: false,
                slackChannelId: null,
                linearEnabled: false,
                linearTeamId: null,
                linearProjectId: null,
            }),
        );
    });
});
