import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JiraReviewSettings } from './JiraReviewSettings';

const mocks = vi.hoisted(() => ({
    installation: undefined as
        | undefined
        | {
              siteId: string | null;
              siteName: string | null;
              siteUrl: string | null;
              requiresSiteSelection: boolean;
          },
    updateRouting: vi.fn(),
    selectSite: vi.fn(),
    install: vi.fn(),
    routing: {
        organizationUuid: 'org-1',
        applyToAllProjects: true,
        projectUuids: [] as string[],
        enabled: false,
        jiraProjectId: '10' as string | null,
        jiraIssueTypeId: null as string | null,
    },
}));

vi.mock('../../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { siteUrl: 'https://app.example.com' } },
        user: {
            data: { ability: { can: () => true } },
        },
    }),
}));

vi.mock('../../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [{ projectUuid: 'lightdash-1', name: 'Jaffle shop' }],
        isInitialLoading: false,
    }),
}));

vi.mock(
    '../../../../../../components/common/JiraIntegration/hooks/useJiraIntegration',
    () => ({
        useJiraInstallation: () => ({
            data: mocks.installation,
            isInitialLoading: false,
        }),
        useInstallJira: () => ({
            mutate: mocks.install,
            isLoading: false,
        }),
        useJiraSites: () => ({
            data: [
                {
                    id: 'site-1',
                    name: 'Acme',
                    url: 'https://acme.atlassian.net',
                },
            ],
            isInitialLoading: false,
        }),
        useSelectJiraSite: () => ({
            mutate: mocks.selectSite,
            isLoading: false,
        }),
        useJiraProjects: () => ({
            data: [{ id: '10', key: 'DATA', name: 'Data' }],
            isInitialLoading: false,
        }),
        useJiraIssueTypes: () => ({
            data: [{ id: '1', name: 'Task', subtask: false }],
            isInitialLoading: false,
        }),
        useDeleteJiraInstallation: () => ({
            mutate: vi.fn(),
            isLoading: false,
        }),
    }),
);

vi.mock('../../../hooks/useReviewNotificationSettings', () => ({
    useReviewJiraRouting: () => ({
        data: mocks.routing,
        isInitialLoading: false,
    }),
    useUpdateReviewJiraRouting: () => ({
        mutate: mocks.updateRouting,
        isLoading: false,
    }),
    useBackfillReviewJiraIssues: () => ({ mutate: vi.fn(), isLoading: false }),
}));

const renderSettings = () =>
    render(
        <MantineProvider>
            <JiraReviewSettings />
        </MantineProvider>,
    );

describe('JiraReviewSettings', () => {
    afterEach(cleanup);

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.installation = undefined;
        mocks.routing = {
            organizationUuid: 'org-1',
            applyToAllProjects: true,
            projectUuids: [],
            enabled: false,
            jiraProjectId: '10',
            jiraIssueTypeId: null,
        };
    });

    it('starts OAuth with the credentials the admin pastes', async () => {
        renderSettings();
        expect(
            screen.getByText(
                'https://app.example.com/api/v1/jira/oauth/callback',
            ),
        ).toBeInTheDocument();
        const connect = screen.getByRole('button', { name: 'Connect Jira' });
        expect(connect).toBeDisabled();
        await userEvent.type(
            screen.getByRole('textbox', { name: 'Client ID' }),
            ' client-1 ',
        );
        await userEvent.type(
            screen.getByLabelText('Client secret'),
            'secret-1',
        );
        await userEvent.click(connect);
        expect(mocks.install).toHaveBeenCalledWith({
            clientId: 'client-1',
            clientSecret: 'secret-1',
        });
    });

    it('asks the admin to choose among accessible sites', async () => {
        mocks.installation = {
            siteId: null,
            siteName: null,
            siteUrl: null,
            requiresSiteSelection: true,
        };
        renderSettings();
        await userEvent.click(
            screen.getByRole('textbox', { name: 'Jira site' }),
        );
        await userEvent.click(screen.getByText(/Acme/));
        expect(mocks.selectSite).toHaveBeenCalledWith('site-1');
    });

    it('enables export after an issue type is selected', async () => {
        mocks.installation = {
            siteId: 'site-1',
            siteName: 'Acme',
            siteUrl: 'https://acme.atlassian.net',
            requiresSiteSelection: false,
        };
        renderSettings();
        await userEvent.click(
            screen.getByRole('textbox', { name: 'Jira issue type' }),
        );
        await userEvent.click(screen.getByText('Task'));
        expect(mocks.updateRouting).toHaveBeenCalledWith({
            applyToAllProjects: true,
            projectUuids: [],
            enabled: true,
            jiraProjectId: '10',
            jiraIssueTypeId: '1',
        });
    });
});
