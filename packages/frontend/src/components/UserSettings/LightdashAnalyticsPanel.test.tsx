import { type AnalyticsProjectStatus } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import LightdashAnalyticsPanel from './LightdashAnalyticsPanel';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org' } }),
}));

const project: NonNullable<AnalyticsProjectStatus['project']> = {
    projectUuid: 'analytics-project',
    name: 'Lightdash analytics',
    slug: 'lightdash-analytics-1',
    url: '/projects/lightdash-analytics-1/tables',
    createdAt: '2026-09-10T00:00:00Z',
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
        vi.resetAllMocks();
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) =>
            url.includes('/dashboards?') ? [] : { project },
        );
    });

    it('creates only on click and stays in settings with dashboards and an Explore link', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({ project: null });
        renderPanel();
        const create = await screen.findByRole('button', {
            name: 'Create',
        });
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) =>
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
        expect(lightdashApi).toHaveBeenCalledWith({
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
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('does not show Create when status fails and allows retry', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderPanel();
        expect(
            await screen.findByText('Unable to load analytics project'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Create' }),
        ).not.toBeInTheDocument();
        vi.mocked(lightdashApi).mockResolvedValue({ project: null });
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByRole('button', { name: 'Create' }),
        ).toBeVisible();
    });

    it('loads dashboard shortcuts without a separate Refresh action', async () => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) =>
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
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/analytics-project/dashboards?includePrivate=true',
            method: 'GET',
            body: undefined,
        });
        expect(
            screen.queryByRole('button', { name: 'Refresh' }),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
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
        renderPanel();
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Sync content',
            }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                url: '/org/analytics-project/sample-content',
                method: 'POST',
                body: undefined,
            }),
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
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
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        vi.mocked(lightdashApi).mockResolvedValue({ project: null });
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
            expect(lightdashApi).toHaveBeenCalledWith({
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
