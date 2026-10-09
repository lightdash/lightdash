import { type AnalyticsProjectStatus } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import LightdashAnalyticsPanel from './LightdashAnalyticsPanel';

vi.mock('../../api');
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

const renderPanel = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/settings']}>
            <Routes>
                <Route path="/settings" element={<LightdashAnalyticsPanel />} />
                <Route
                    path={project.url}
                    element={<div>Analytics explores</div>}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('LightdashAnalyticsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockImplementation(async ({ url }) =>
            url.includes('/dashboards?') ? [] : { project },
        );
    });

    it('creates only on click and stays in settings with dashboards and an Explore link', async () => {
        mockedLightdashApi.mockResolvedValue({ project: null });
        renderPanel();
        const create = await screen.findByRole('button', {
            name: 'Create',
        });
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        mockedLightdashApi.mockImplementation(async ({ method, url }) =>
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
            await screen.findByRole('link', { name: 'Explore' }),
        ).toHaveAttribute('href', project.url);
        expect(
            await screen.findByRole('link', {
                name: 'Lightdash usage overview',
            }),
        ).toHaveAttribute(
            'href',
            '/projects/lightdash-analytics-1/dashboards/lightdash-analytics-overview/view',
        );
        expect(
            screen.queryByText('Analytics explores'),
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

    it('opens an existing project without recreating or syncing it', async () => {
        renderPanel();
        expect(
            await screen.findByRole('link', { name: 'Explore' }),
        ).toHaveAttribute('href', project.url);
        expect(
            screen.queryByRole('button', { name: 'Create' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
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
        mockedLightdashApi.mockImplementation(async ({ url }) =>
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

    it('syncs managed content without deleting or recreating the project', async () => {
        mockedLightdashApi.mockImplementation(async ({ url }) =>
            url.includes('/dashboards?')
                ? []
                : { project: { ...project, hasContentUpdates: true } },
        );
        renderPanel();
        await userEvent.click(
            await screen.findByRole('button', {
                name: /Sync content/,
            }),
        );
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
                url: '/org/analytics-project/sample-content',
                method: 'POST',
                body: undefined,
            }),
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/analytics-project',
                method: 'POST',
            }),
        );
        expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute(
            'href',
            project.url,
        );
    });

    it('shows available content in the tooltip and hides sync after updating', async () => {
        let hasContentUpdates = true;
        mockedLightdashApi.mockImplementation(async ({ url, method }) => {
            if (url.includes('/dashboards?')) return [];
            if (method === 'POST') {
                hasContentUpdates = false;
                return undefined;
            }
            return { project: { ...project, hasContentUpdates } };
        });
        renderPanel();
        expect(
            await screen.findByRole('img', {
                name: 'New analytics content available',
            }),
        ).toBeVisible();
        const sync = screen.getByRole('button', { name: /Sync content/ });
        await userEvent.hover(sync);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'New analytics content is available.',
        );
        expect(screen.getByRole('tooltip')).toHaveTextContent(
            'replacing edits to them',
        );
        await userEvent.unhover(sync);
        await userEvent.click(sync);
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /Sync content/ }),
            ).not.toBeInTheDocument(),
        );
    });

    it('hides sync when counts match without syncing automatically', async () => {
        renderPanel();
        await screen.findByRole('link', { name: 'Explore' });
        expect(
            screen.queryByRole('button', { name: /Sync content/ }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        expect(
            screen.queryByRole('img', {
                name: 'New analytics content available',
            }),
        ).not.toBeInTheDocument();
    });

    it('keeps sync available when update status is unknown', async () => {
        const legacyProject = { ...project };
        Reflect.deleteProperty(legacyProject, 'hasContentUpdates');
        mockedLightdashApi.mockImplementation(async ({ url }) =>
            url.includes('/dashboards?') ? [] : { project: legacyProject },
        );
        renderPanel();
        expect(
            await screen.findByRole('button', { name: /Sync content/ }),
        ).toBeVisible();
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
