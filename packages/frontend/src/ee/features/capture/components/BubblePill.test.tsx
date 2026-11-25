import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type PillState } from '../bubblePill';
import BubblePill from './BubblePill';

const setup = (state: PillState, marks: number[] = [1]) => {
    const onExpand = vi.fn();
    renderWithProviders(
        <BubblePill
            agent={{ name: 'Jaffle agent', imageUrl: null }}
            state={state}
            marks={marks}
            color="#e03131"
            onExpand={onExpand}
        />,
    );
    return onExpand;
};

describe('BubblePill', () => {
    it('is a button that expands the bubble', () => {
        const onExpand = setup('working');
        fireEvent.click(screen.getByRole('button', { name: /^Expand/ }));
        expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['working', 'Working'],
        ['ready', 'Reply ready'],
        ['needs-answer', 'Needs your answer'],
        ['failed', 'Could not send'],
    ] as const)('says %s in words', (state, label) => {
        setup(state);
        expect(screen.getByText(label)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: `Expand: ${label}` }),
        ).toHaveAttribute('data-state', state);
    });

    it('shows a spinner only while working and a dot only when unread', () => {
        setup('working');
        expect(screen.getByTestId('pill-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('pill-unread')).toBeNull();
    });

    it('a ready reply has the unread dot', () => {
        setup('ready');
        expect(screen.getByTestId('pill-unread')).toBeInTheDocument();
        expect(screen.queryByTestId('pill-spinner')).toBeNull();
    });

    it('at rest it is named after the agent', () => {
        setup('idle');
        expect(screen.getByText('Jaffle agent')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Expand: Jaffle agent' }),
        ).toBeInTheDocument();
    });

    it('shows the first mark and how many more there are', () => {
        setup('working', [1, 2, 3]);
        expect(screen.getByLabelText('Mark 1')).toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('shows no chip for a conversation with no marks', () => {
        setup('working', []);
        expect(screen.queryByLabelText(/^Mark/)).toBeNull();
    });
});
