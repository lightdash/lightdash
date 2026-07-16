import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchReport } from './DeepResearchReport';

const renderReport = (onClose = vi.fn()) =>
    renderWithProviders(
        <>
            <div data-deep-research-report-target />
            <DeepResearchReport
                run={deepResearchRunFixture}
                opened
                onClose={onClose}
            />
        </>,
    );

describe('DeepResearchReport', () => {
    it('returns to chat from the report header', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderReport(onClose);

        await user.click(screen.getByRole('button', { name: 'Back to chat' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('navigates from a claim marker to its supporting query', async () => {
        const user = userEvent.setup();
        renderReport();

        const marker = screen.getByRole('button', {
            name: /Evidence 1: Enterprise renewal cohort/i,
        });
        await user.click(marker);

        expect(marker).toHaveAttribute('aria-pressed', 'true');
        const evidence = screen.getByTestId(
            'evidence-detail-evidence-retention-query',
        );
        await waitFor(() => expect(evidence).toHaveFocus());
        expect(evidence).toHaveTextContent(
            '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
        );
        expect(within(evidence).getByText(/Renewed ARR/)).toBeInTheDocument();
        expect(
            within(evidence).getByText(/Segment is Enterprise/),
        ).toBeInTheDocument();
        expect(
            within(evidence).getByRole('link', {
                name: 'Open in Lightdash',
            }),
        ).toBeInTheDocument();
    });

    it('supports keyboard navigation between evidence markers', () => {
        renderReport();

        const firstMarker = screen.getByRole('button', {
            name: /Evidence 1: Enterprise renewal cohort/i,
        });
        firstMarker.focus();
        fireEvent.keyDown(firstMarker, { key: 'ArrowRight' });

        const secondMarker = screen.getByRole('button', {
            name: /Evidence 2: Q2 enterprise incident review/i,
        });
        expect(secondMarker).toHaveFocus();
        expect(secondMarker).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByTestId('evidence-detail-evidence-incident-review'),
        ).toHaveTextContent('Q2 enterprise incident review');
    });
});
