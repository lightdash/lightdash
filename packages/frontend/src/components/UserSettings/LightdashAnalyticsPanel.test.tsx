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
    beforeEach(() => vi.resetAllMocks());

    it('creates only on click and redirects using the server URL', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({ project: null });
        renderPanel();
        const create = await screen.findByRole('button', {
            name: 'Create',
        });
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        vi.mocked(lightdashApi).mockImplementation(async ({ method }) =>
            method === 'POST'
                ? {
                      projectUuid: project.projectUuid,
                      url: project.url,
                      created: true,
                  }
                : { project },
        );
        await userEvent.click(create);
        expect(await screen.findByText('Analytics explores')).toBeVisible();
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/org/analytics-project',
            method: 'POST',
            body: undefined,
        });
    });

    it('opens an existing project without recreating or refreshing it', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({ project });
        renderPanel();
        expect(
            await screen.findByRole('link', { name: 'Open' }),
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

    it('requires confirmation before deleting and returns to Create', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({ project });
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
