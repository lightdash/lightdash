import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchReport } from './DeepResearchReport';

// Report charts are fetched per reference rather than persisted with the run,
// so the flow test has to resolve that query to place the chart.
const mocks = vi.hoisted(() => ({ useChartQuery: vi.fn() }));

vi.mock('../../hooks/useDeepResearch', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useDeepResearchChartQuery: mocks.useChartQuery,
}));

vi.mock('./DeepResearchChartTile', () => ({
    DeepResearchChartTile: ({
        chart,
        reportRunAt,
    }: {
        chart: { title: string };
        reportRunAt: string;
    }) => (
        <div data-testid="deep-research-chart" data-report-run-at={reportRunAt}>
            {chart.title}
        </div>
    ),
}));

const renderReport = (onClose = vi.fn(), run = deepResearchRunFixture) =>
    renderWithProviders(
        <DeepResearchReport run={run} opened onClose={onClose} />,
    );

describe('DeepResearchReport', () => {
    it('labels the report header as beta exactly once', () => {
        renderReport();

        expect(screen.getAllByText('Beta')).toHaveLength(1);
    });

    it('returns to chat from the report header', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderReport(onClose);

        await user.click(screen.getByRole('button', { name: 'Back to chat' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('renders the markdown as one flow with the chart between setup and interpretation', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: { title: 'Enterprise retention by incident exposure' },
        });
        renderReport();

        await waitFor(() =>
            expect(
                screen.getByRole('heading', {
                    name: /Churn was concentrated/i,
                }),
            ).toBeInTheDocument(),
        );

        const setup = screen.getByText(/The renewal cohort joins/i);
        const chart = screen.getByTestId('deep-research-chart');
        const interpretation = screen.getByText(
            /reliability the strongest explanation/i,
        );
        expect(chart).toHaveTextContent(
            'Enterprise retention by incident exposure',
        );
        expect(chart).toHaveAttribute(
            'data-report-run-at',
            deepResearchRunFixture.completedAt,
        );
        expect(
            screen.queryByText(
                'Three incident-affected renewals account for most churn in the quarter.',
            ),
        ).not.toBeInTheDocument();
        expect(
            Boolean(
                setup.compareDocumentPosition(chart) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);
        expect(
            Boolean(
                chart.compareDocumentPosition(interpretation) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);
    });

    it('renders confidence tags as badges with their caveats', async () => {
        renderReport();

        await waitFor(() =>
            expect(screen.getByText('high confidence')).toBeInTheDocument(),
        );
        expect(screen.getByText('medium confidence')).toBeInTheDocument();
        expect(
            screen.getByText(/Association, not a controlled causal estimate/i),
        ).toBeInTheDocument();
    });

    it('renders whitelisted callouts with markdown children', async () => {
        renderReport();

        await waitFor(() =>
            expect(screen.getByText('Data quality')).toBeInTheDocument(),
        );
        // Bold and lists inside a callout must render as markdown, not as
        // raw text (regression: streamdown allowedTags glued tag content
        // into one raw html block, leaving literal ** and flattened lists).
        expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
        expect(screen.getByText('incomplete')).toBeInTheDocument();
        expect(
            screen.getByText('Missing exit-survey responses').closest('li'),
        ).not.toBeNull();
    });

    it('renders the model-authored conclusion bullets and sources', async () => {
        renderReport();

        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Conclusion' }),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByText(/Reliability incidents, not adoption/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Q2 enterprise incident review/i),
        ).toBeInTheDocument();
    });

    it('provides report section navigation', async () => {
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            sourceCount: null,
        });

        const contents = await screen.findByRole('navigation', {
            name: 'Report contents',
        });
        await waitFor(() => {
            expect(contents).toHaveTextContent('Summary');
            expect(contents).toHaveTextContent('Conclusion');
            expect(contents).toHaveTextContent('Sources1');
        });

        const summary = screen.getByRole('button', { name: 'Summary' });
        const sources = screen.getByRole('button', { name: 'Sources' });

        expect(summary).toHaveAttribute('aria-current', 'location');
        expect(summary).toHaveAttribute('data-active', 'true');
        expect(sources).not.toHaveAttribute('data-active');
    });

    it('strips disallowed html from the report markdown', async () => {
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: `Intro prose.\n\n<script>window.pwned = true;</script>\n\n<img src="x" onerror="window.pwned = true" />\n\n## Finding\n\n<confidence level="high">ok</confidence>\n\nBody.\n\n## Conclusion\n\n- done`,
        });

        await waitFor(() =>
            expect(screen.getByText('Intro prose.')).toBeInTheDocument(),
        );
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('img[onerror]')).toBeNull();
        expect(screen.getByText('high confidence')).toBeInTheDocument();
    });

    it('renders nothing when the run has no report', () => {
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: null,
        });
        expect(screen.queryByText('Back to chat')).not.toBeInTheDocument();
    });
});
