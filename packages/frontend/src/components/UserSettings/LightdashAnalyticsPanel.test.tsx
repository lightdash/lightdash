import {
    type AnalyticsHistoryBackfillStatus,
    type AnalyticsProjectStatus,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { useProjectAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import LightdashAnalyticsPanel from './LightdashAnalyticsPanel';

vi.mock('../../api');
vi.mock(
    '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility',
    () => ({
        useProjectAiAgentButtonVisibility: vi.fn(),
    }),
);
vi.mock('../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org' } }),
}));

const project: NonNullable<AnalyticsProjectStatus['project']> = {
    projectUuid: 'analytics-project',
    name: 'Lightdash analytics',
    slug: 'lightdash-analytics-1',
    url: '/projects/lightdash-analytics-1/tables',
    createdAt: '2026-09-10T00:00:00Z',
    hasContentUpdates: false,
};
const homepageUrl = '/projects/lightdash-analytics-1/home';
const askAiUrl = `/projects/${project.projectUuid}/ai-agents`;

const coveredHistory: AnalyticsHistoryBackfillStatus = {
    running: false,
    completed: true,
};

const mockPanelApi = (
    implementation: (
        request: Parameters<typeof sharedLightdashApi>[0],
    ) => Promise<unknown>,
) =>
    mockedLightdashApi.mockImplementation(async (request) =>
        request.url === '/org/analytics-project/backfill'
            ? coveredHistory
            : implementation(request),
    );

const renderPanel = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/settings']}>
            <Routes>
                <Route path="/settings" element={<LightdashAnalyticsPanel />} />
                <Route
                    path={homepageUrl}
                    element={<div>Analytics homepage</div>}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('LightdashAnalyticsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useProjectAiAgentButtonVisibility).mockReturnValue(true);
        mockPanelApi(async ({ url }) =>
            url.includes('/dashboards?') ? [] : { project },
        );
    });

    it('creates only on click and stays in settings with dashboard, homepage and AI links', async () => {
        mockedLightdashApi.mockResolvedValue({ project: null });
        renderPanel();
        const create = await screen.findByRole('button', {
            name: 'Create',
        });
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        mockPanelApi(async ({ method, url }) =>
            url.includes('/dashboards?')
                ? [
                      {
                          uuid: 'sample-dashboard',
                          slug: 'lightdash-analytics-overview',
                          name: 'Lightdash usage overview',
                          updatedAt: '2026-09-10T00:00:00Z',
                      },
                  ]
                : method === 'POST'
                  ? {
                        projectUuid: project.projectUuid,
                        url: project.url,
                        created: true,
                    }
                  : { project },
        );
        await userEvent.click(create);
        expect(
            await screen.findByRole('link', { name: 'Homepage' }),
        ).toHaveAttribute('href', homepageUrl);
        expect(screen.getByRole('link', { name: 'Ask AI' })).toHaveAttribute(
            'href',
            askAiUrl,
        );
        expect(useProjectAiAgentButtonVisibility).toHaveBeenLastCalledWith(
            project.projectUuid,
        );
        expect(
            await screen.findByRole('link', {
                name: 'Lightdash usage overview',
            }),
        ).toHaveAttribute(
            'href',
            '/projects/lightdash-analytics-1/dashboards/lightdash-analytics-overview/view',
        );
        expect(
            screen.queryByText('Analytics homepage'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Create' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            url: '/org/analytics-project',
            method: 'POST',
            body: undefined,
        });
    });

    it('shows the homepage without a manual sync action when content updates are pending', async () => {
        mockPanelApi(async ({ url }) =>
            url.includes('/dashboards?')
                ? []
                : { project: { ...project, hasContentUpdates: true } },
        );
        renderPanel();
        expect(
            await screen.findByRole('link', { name: 'Homepage' }),
        ).toHaveAttribute('href', homepageUrl);
        expect(
            screen.queryByRole('button', { name: 'Create' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Sync content' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('keeps the homepage link when Ask AI is unavailable', async () => {
        vi.mocked(useProjectAiAgentButtonVisibility).mockReturnValue(false);
        renderPanel();
        expect(
            await screen.findByRole('link', { name: 'Homepage' }),
        ).toHaveAttribute('href', homepageUrl);
        expect(
            screen.queryByRole('link', { name: 'Ask AI' }),
        ).not.toBeInTheDocument();
    });

    it('does not show Create when status fails and allows retry', async () => {
        mockedLightdashApi.mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderPanel();
        expect(
            await screen.findByText('Unable to load analytics project'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Create' }),
        ).not.toBeInTheDocument();
        mockedLightdashApi.mockResolvedValue({ project: null });
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByRole('button', { name: 'Create' }),
        ).toBeVisible();
    });

    it('loads dashboard shortcuts without a separate Refresh action', async () => {
        mockPanelApi(async ({ url }) =>
            url.includes('/dashboards?')
                ? [
                      {
                          uuid: 'dashboard',
                          slug: 'ai-usage-overview',
                          name: 'AI usage overview',
                          description: 'Daily AI usage',
                          updatedAt: '2026-09-10T10:00:00Z',
                      },
                  ]
                : { project },
        );
        renderPanel();
        expect(
            await screen.findByRole('link', { name: 'AI usage overview' }),
        ).toBeVisible();
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            url: '/projects/analytics-project/dashboards?includePrivate=true',
            method: 'GET',
            body: undefined,
        });
        expect(
            screen.queryByRole('button', { name: 'Refresh' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Add sample dashboard' }),
        ).not.toBeInTheDocument();
        expect(
            await screen.findByRole('link', { name: 'AI usage overview' }),
        ).toHaveAttribute(
            'href',
            '/projects/lightdash-analytics-1/dashboards/ai-usage-overview/view',
        );
        expect(screen.getByText('Daily AI usage')).toBeVisible();
        expect(screen.getByText(/^Updated /)).toBeVisible();
    });

    it('requires confirmation before deleting and returns to Create', async () => {
        renderPanel();
        await userEvent.click(
            await screen.findByRole('button', { name: 'Delete' }),
        );
        expect(
            await screen.findByRole('dialog', {
                name: 'Delete analytics project?',
            }),
        ).toBeVisible();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        mockedLightdashApi.mockResolvedValue({ project: null });
        await userEvent.click(
            within(
                screen.getByRole('dialog', {
                    name: 'Delete analytics project?',
                }),
            ).getByRole('button', {
                name: 'Delete',
            }),
        );
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
                url: '/org/analytics-project/analytics-project',
                method: 'DELETE',
                body: undefined,
            }),
        );
        expect(
            await screen.findByRole('button', { name: 'Create' }),
        ).toBeVisible();
    });
});
