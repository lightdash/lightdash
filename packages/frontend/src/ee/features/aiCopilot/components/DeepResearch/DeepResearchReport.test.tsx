import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchReport } from './DeepResearchReport';

describe('DeepResearchReport', () => {
    it('navigates from a claim marker to its supporting query', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DeepResearchReport
                run={deepResearchRunFixture}
                opened
                onClose={vi.fn()}
            />,
        );

        const marker = screen.getByRole('button', {
            name: /Evidence 1: Enterprise renewal cohort/i,
        });
        await user.click(marker);

        expect(marker).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('evidence-detail')).toHaveTextContent(
            '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
        );
        expect(screen.getByText(/Renewed ARR/)).toBeInTheDocument();
        expect(screen.getByText(/Segment is Enterprise/)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open in Lightdash' }),
        ).toBeInTheDocument();
    });

    it('supports keyboard navigation between evidence markers', () => {
        renderWithProviders(
            <DeepResearchReport
                run={deepResearchRunFixture}
                opened
                onClose={vi.fn()}
            />,
        );

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
        expect(screen.getByTestId('evidence-detail')).toHaveTextContent(
            'Q2 enterprise incident review',
        );
    });

    it('runs the report actions', async () => {
        const user = userEvent.setup();
        const onFollowUp = vi.fn();
        const onChallenge = vi.fn();
        const onRerun = vi.fn();
        renderWithProviders(
            <DeepResearchReport
                run={deepResearchRunFixture}
                opened
                onClose={vi.fn()}
                onAskFollowUp={onFollowUp}
                onChallenge={onChallenge}
                onRerun={onRerun}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Ask a follow-up' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Challenge this finding' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Rerun with more depth' }),
        );

        expect(onFollowUp).toHaveBeenCalledOnce();
        expect(onChallenge).toHaveBeenCalledOnce();
        expect(onRerun).toHaveBeenCalledOnce();
    });
});
