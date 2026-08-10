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
    DeepResearchChartTile: ({ chart }: { chart: { title: string } }) => (
        <div data-testid="deep-research-chart">{chart.title}</div>
    ),
}));

const renderReport = (onClose = vi.fn(), run = deepResearchRunFixture) =>
    renderWithProviders(
        <DeepResearchReport run={run} opened onClose={onClose} />,
    );

const canonicalMarkdown = `# Reliability Drove Retention Losses

Retention fell because reliability incidents affected several large renewals. The pattern is concentrated rather than a broad commercial slowdown.

## Reliability drove the decline

<chart id="7c4b40ba-79f8-4fd2-9c43-223eca8fa76f">

The concentration makes reliability the strongest tested explanation, while incomplete support sentiment for one account limits causal certainty. Compare incident timing with renewal decisions next.

## Adoption was not the cause

Adoption improved after renewal decisions and therefore does not explain the losses.

## Conclusion

Reliability at renewal is the clearest intervention point.`;

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

    it('renders the generated title and chart-first findings', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: { title: 'Enterprise retention by incident exposure' },
        });
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: canonicalMarkdown,
            sourceCount: null,
        });

        const findingTitle = await screen.findByRole('heading', {
            name: 'Reliability drove the decline',
        });
        const chart = screen.getByTestId('deep-research-chart');
        const interpretation = screen.getByText(
            /strongest tested explanation/i,
        );

        expect(
            Boolean(
                findingTitle.compareDocumentPosition(chart) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);
        expect(
            Boolean(
                chart.compareDocumentPosition(interpretation) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);
        expect(screen.getByText(/incomplete support sentiment/i)).toBeVisible();
        expect(
            screen.getByRole('heading', {
                name: 'Reliability Drove Retention Losses',
            }),
        ).toBeVisible();
        expect(
            screen.queryByRole('heading', {
                name: deepResearchRunFixture.question,
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('navigation', { name: 'Report contents' }),
        ).not.toHaveTextContent('Sources');
        expect(
            screen.getByRole('heading', {
                name: 'Adoption was not the cause',
            }),
        ).toBeVisible();
        expect(
            screen.getByText(/Reliability at renewal is the clearest/i),
        ).toBeVisible();
    });

    it('renders inline markdown in the generated report title', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: undefined,
        });
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: canonicalMarkdown.replace(
                '# Reliability Drove Retention Losses',
                '# Reliability **Drove** Retention Losses',
            ),
        });

        expect((await screen.findByText('Drove')).tagName).toBe('STRONG');
    });

    it('preserves interpretation when its live evidence is unavailable', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: undefined,
        });
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: canonicalMarkdown,
        });

        expect(await screen.findByText('Chart unavailable')).toBeVisible();
        expect(screen.getByText(/strongest tested explanation/i)).toBeVisible();
    });

    it('renders inline finding markdown without corrupting text', async () => {
        mocks.useChartQuery.mockReturnValue({
            isLoading: false,
            data: undefined,
        });
        const markdown = canonicalMarkdown
            .replace(
                '## Reliability drove the decline',
                '## Escaped \\*literal\\* and `orders_total`',
            )
            .replace(
                'Compare incident timing with renewal decisions next.',
                'See [warehouse](https://example.com/docs).',
            );
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: markdown,
        });

        expect(
            await screen.findByRole('heading', {
                name: 'Escaped *literal* and orders_total',
            }),
        ).toBeVisible();
        expect(screen.getByText('orders_total').tagName).toBe('CODE');
        expect(screen.getByRole('link', { name: 'warehouse' })).toHaveAttribute(
            'href',
            'https://example.com/docs',
        );
    });

    it('falls back to plain Markdown for malformed structured reports', async () => {
        const malformed = `# Incomplete Research Report

This report has only one finding.

## Legacy-compatible finding

The narrative remains readable.

## Conclusion

Run the research again.`;
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: malformed,
        });

        expect(
            await screen.findByRole('heading', {
                name: 'Legacy-compatible finding',
            }),
        ).toBeVisible();
        expect(
            screen.getByText('The narrative remains readable.'),
        ).toBeVisible();
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
            resultMarkdown: `Intro prose.\n\n<script>window.pwned = true;</script>\n\n<img src="x" onerror="window.pwned = true" />\n\n## Finding\n\n<custom>unsafe</custom>\n\nBody.\n\n## Conclusion\n\n- done`,
        });

        await waitFor(() =>
            expect(screen.getByText('Intro prose.')).toBeInTheDocument(),
        );
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('img[onerror]')).toBeNull();
        expect(document.querySelector('custom')).toBeNull();
    });

    it('renders nothing when the run has no report', () => {
        renderReport(vi.fn(), {
            ...deepResearchRunFixture,
            resultMarkdown: null,
        });
        expect(screen.queryByText('Back to chat')).not.toBeInTheDocument();
    });
});
