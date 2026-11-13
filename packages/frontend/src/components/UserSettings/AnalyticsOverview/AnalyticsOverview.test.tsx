import {
    ProjectType,
    QueryHistoryStatus,
    getFilterRules,
    type ExecuteAsyncMetricQueryRequestParams,
} from '@lightdash/common';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LightdashApiProps } from '../../../api';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../testing/testUtils';
import AnalyticsOverview from './AnalyticsOverview';

vi.mock('../../../api');
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
vi.mock('../../EChartsReactWrapper', () => ({ default: () => null }));

type AnalyticsQuery = ExecuteAsyncMetricQueryRequestParams['query'];

const ready = (rows: Record<string, unknown>[] = []) => ({
    status: QueryHistoryStatus.READY,
    rows: rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([field, raw]) => [
                field,
                { value: { raw, formatted: String(raw) } },
            ]),
        ),
    ),
});

const mockQueries = (
    getResult: (
        query: AnalyticsQuery,
        queryUuid: string,
    ) => ReturnType<typeof ready> | Promise<ReturnType<typeof ready>> = () =>
        ready(),
) => {
    const launched: { url: string; query: AnalyticsQuery }[] = [];
    const byId = new Map<string, AnalyticsQuery>();
    mockedLightdashApi.mockImplementation(
        async ({ method, url, body }: LightdashApiProps) => {
            if (method === 'POST' && url.endsWith('/metric-query')) {
                const { query } = JSON.parse(
                    String(body),
                ) as ExecuteAsyncMetricQueryRequestParams;
                launched.push({ url, query });
                const queryUuid = `query-${launched.length}`;
                byId.set(queryUuid, query);
                return { queryUuid };
            }
            if (method === 'POST' && url.endsWith('/cancel')) return undefined;
            const queryUuid = url.split('/').at(-1) ?? '';
            const query = byId.get(queryUuid);
            if (method === 'GET' && query) return getResult(query, queryUuid);
            throw new Error(`Unexpected request: ${method} ${url}`);
        },
    );
    return launched;
};

const renderOverview = () =>
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

const filterValue = (query: AnalyticsQuery, id: string) =>
    getFilterRules(query.filters).find((rule) => rule.id === id)?.values?.[0];

describe('Analytics settings overview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('switches the related tab from a headline and only queries visible charts', async () => {
        const launched = mockQueries();
        renderOverview();
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(launched.map(({ query }) => query.exploreName)).not.toContain(
            'ai_usage',
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
        const launched = mockQueries();
        renderOverview();
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
        await waitFor(() =>
            expect(
                launched.some(
                    ({ query }) =>
                        filterValue(query, 'project') === 'reported-project' &&
                        (Date.parse(String(filterValue(query, 'end'))) -
                            Date.parse(String(filterValue(query, 'start')))) /
                            86_400_000 ===
                            7,
                ),
            ).toBe(true),
        );
        expect(
            launched.every(({ url }) => url.startsWith('/projects/analytics/')),
        ).toBe(true);
        expect(
            screen.queryByRole('button', { name: 'Duplicate' }),
        ).not.toBeInTheDocument();
    });

    it('loads five current queries before comparisons and counts all 90 AI days from the chart result', async () => {
        const finishChart = Promise.withResolvers<ReturnType<typeof ready>>();
        const launched = mockQueries((query) => {
            const end = String(filterValue(query, 'end'));
            const start = String(filterValue(query, 'start'));
            const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
            if (days !== 90) return ready();
            if (query.dimensions.includes('user_activity_user_name'))
                return finishChart.promise;
            if (query.exploreName !== 'agent_request_starts') return ready();
            return ready(
                Array.from(
                    { length: Math.min(days, query.limit) },
                    (_, index) => ({
                        agent_requests_requested_at_day: new Date(
                            Date.parse(start) + 86_400_000 * index,
                        ).toISOString(),
                        agent_requests_total_requests: 10,
                    }),
                ),
            );
        });
        renderOverview();
        await userEvent.click(screen.getByText('Last 90 days'));

        expect(
            await within(
                screen.getByRole('button', { name: 'View ai agent requests' }),
            ).findByText('900'),
        ).toBeVisible();
        const ninetyDayQueries = () =>
            launched
                .map(({ query }) => query)
                .filter(
                    (query) =>
                        Date.parse(String(filterValue(query, 'end'))) -
                            Date.parse(String(filterValue(query, 'start'))) ===
                        90 * 86_400_000,
                );
        const current = ninetyDayQueries();
        expect(current).toHaveLength(5);
        expect(
            current.filter(
                (query) => query.exploreName === 'agent_request_starts',
            ),
        ).toHaveLength(1);
        expect(mockedLightdashApi.getResultsFromStream).not.toHaveBeenCalled();

        await act(async () => finishChart.resolve(ready()));
        await waitFor(() => expect(ninetyDayQueries()).toHaveLength(8));
        const preceding = ninetyDayQueries().slice(5);
        expect(
            preceding.every(
                (query) =>
                    filterValue(query, 'end') ===
                    filterValue(current[0], 'start'),
            ),
        ).toBe(true);
    });

    it('cancels a superseded query even when its creation response arrives after the project switch', async () => {
        mockQueries();
        const respond = Promise.withResolvers<{ queryUuid: string }>();
        mockedLightdashApi.mockImplementationOnce(
            (request: LightdashApiProps) => {
                expect(request.url).toBe(
                    '/projects/analytics/query/metric-query',
                );
                expect(request.signal).toBeUndefined();
                return respond.promise;
            },
        );
        renderOverview();
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Project' }),
        );
        await userEvent.click(screen.getByRole('option', { name: 'Sales' }));
        await act(async () => respond.resolve({ queryUuid: 'superseded' }));

        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/projects/analytics/query/superseded/cancel',
            }),
        );
        expect(mockedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: '/projects/analytics/query/superseded',
            }),
        );
    });
});
