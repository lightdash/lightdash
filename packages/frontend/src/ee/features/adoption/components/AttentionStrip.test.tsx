import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { AttentionStrip } from './AttentionStrip';

const renderStrip = (canManage: boolean) =>
    renderWithProviders(
        <AttentionStrip
            conflictCount={48}
            unassignedCount={140}
            canManage={canManage}
            onReview={vi.fn()}
        />,
    );

describe('AttentionStrip', () => {
    // jsdom has no layout, so these check the flex rules that keep the button whole at any width
    it('never shrinks the Place people button, and wraps it under the message when the strip is narrow', () => {
        renderStrip(true);
        const button = screen.getByRole('button', { name: 'Place people' });
        expect(button).toHaveStyle({ flexShrink: '0' });
        const message = screen.getByText(
            /They aren't counted in any department/,
        );
        // The message gives up width down to 16rem, then the button takes a line of its own
        expect(message).toHaveStyle({ flexGrow: '1', flexBasis: '16rem' });
        expect(message.parentElement).toHaveStyle('--group-wrap: wrap');
        expect(message.parentElement).toContainElement(button);
    });
    it('offers no button to people who cannot place others', () => {
        renderStrip(false);
        expect(
            screen.getByText(
                /They aren't counted in any department until an admin places them/,
            ),
        ).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
