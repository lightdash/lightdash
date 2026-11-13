import { ProjectType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AnalyticsOverview from './AnalyticsOverview';
import { useAnalyticsOverviewQuery } from './useAnalyticsOverviewQuery';

vi.mock('../../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [
            {
                projectUuid: 'reported-project',
                name: 'Sales',
                type: ProjectType.DEFAULT,
            },
            {
                projectUuid: 'analytics',
                name: 'Analytics',
                type: ProjectType.DEFAULT,
            },
            {
                projectUuid: 'preview',
                name: 'Preview',
                type: ProjectType.PREVIEW,
            },
        ],
    }),
}));
vi.mock('./useAnalyticsOverviewQuery');
vi.mock('../../EChartsReactWrapper', () => ({ default: () => null }));

describe('Analytics settings overview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useAnalyticsOverviewQuery).mockReturnValue({
            data: [],
            isLoading: false,
            isError: false,
        } as unknown as ReturnType<typeof useAnalyticsOverviewQuery>);
    });

    it('switches the related tab from a headline and only queries visible charts', async () => {
        renderWithProviders(
            <MemoryRouter>
                <AnalyticsOverview
                    projectUuid="analytics"
                    projectUrlIdentifier="analytics-slug"
                    dashboards={[]}
                    heading={null}
                    actions={null}
                />
            </MemoryRouter>,
        );
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(useAnalyticsOverviewQuery).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ source: 'tokens' }),
            expect.anything(),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'View ai agent requests' }),
        );
        expect(
            screen.getByRole('tab', { name: 'Agents & AI' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByRole('region', { name: 'Requests by agent' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('region', { name: 'Most active users' }),
        ).not.toBeInTheDocument();
    });

    it('keeps execution on Analytics when the reported project or date changes', async () => {
        renderWithProviders(
            <MemoryRouter>
                <AnalyticsOverview
                    projectUuid="analytics"
                    projectUrlIdentifier="analytics-slug"
                    dashboards={[]}
                    heading={null}
                    actions={null}
                />
            </MemoryRouter>,
        );
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Project' }),
        );
        expect(
            screen.getByRole('option', { name: 'Analytics' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('option', { name: 'Preview' }),
        ).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('option', { name: 'Sales' }));
        await userEvent.click(screen.getByText('Last 7 days'));
        const calls = vi.mocked(useAnalyticsOverviewQuery).mock.calls;
        expect(calls.every(([uuid]) => uuid === 'analytics')).toBe(true);
        const filters = calls.at(-1)![2];
        expect(filters.projectUuid).toBe('reported-project');
        expect(
            (Date.parse(filters.end) - Date.parse(filters.start)) / 86_400_000,
        ).toBe(7);
        expect(
            screen.queryByRole('button', { name: 'Duplicate' }),
        ).not.toBeInTheDocument();
    });
});
