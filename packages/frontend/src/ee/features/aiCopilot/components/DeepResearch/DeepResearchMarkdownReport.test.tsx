import { type AiDeepResearchChartData } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { DeepResearchMarkdownReport } from './DeepResearchMarkdownReport';

const mocks = vi.hoisted(() => ({ useChartQuery: vi.fn() }));

vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchChartQuery: mocks.useChartQuery,
}));

vi.mock('./DeepResearchChartTile', () => ({
    DeepResearchChartTile: ({ chart }: { chart: AiDeepResearchChartData }) => (
        <div>{chart.title}</div>
    ),
}));

const queryUuid = '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f';

describe('DeepResearchMarkdownReport', () => {
    it('hydrates a query-backed chart when no legacy snapshot exists', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: { title: 'Revenue trend' },
        });

        renderWithProviders(
            <DeepResearchMarkdownReport
                markdown={`## Finding\n\n<chart id="${queryUuid}" title="Revenue trend" description="Revenue by month.">`}
                chartData={null}
                projectUuid="project-1"
                runUuid="run-1"
            />,
        );

        expect(await screen.findByText('Revenue trend')).toBeVisible();
        expect(mocks.useChartQuery).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            runUuid: 'run-1',
            queryUuid,
        });
    });
});
