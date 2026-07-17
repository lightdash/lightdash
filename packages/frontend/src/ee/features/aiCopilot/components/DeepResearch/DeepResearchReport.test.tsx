import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchReport } from './DeepResearchReport';

vi.mock('./DeepResearchChartTile', () => ({
    DeepResearchChartTile: ({ chart }: { chart: { title: string } }) => (
        <div data-testid="deep-research-chart">{chart.title}</div>
    ),
}));

const renderReport = (onClose = vi.fn(), run = deepResearchRunFixture) =>
    renderWithProviders(
        <DeepResearchReport run={run} opened onClose={onClose} />,
    );

describe('DeepResearchReport', () => {
    it('returns to chat from the report header', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderReport(onClose);

        await user.click(screen.getByRole('button', { name: 'Back to chat' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('renders the markdown as one flow with the chart between setup and interpretation', async () => {
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
