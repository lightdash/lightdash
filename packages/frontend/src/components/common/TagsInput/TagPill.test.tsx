import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { TagPill } from './TagPill';

describe('TagPill', () => {
    it('renders the label', () => {
        renderWithProviders(<TagPill label="my tag" />);
        expect(screen.getByText('my tag')).toBeInTheDocument();
    });

    it('calls onRemove when the remove button is pressed', async () => {
        const onRemove = vi.fn();
        renderWithProviders(<TagPill label="my tag" onRemove={onRemove} />);
        await userEvent.click(screen.getByRole('button', { hidden: true }));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('renders no remove button when readOnly', () => {
        renderWithProviders(
            <TagPill label="my tag" readOnly onRemove={() => {}} />,
        );
        expect(
            screen.queryByRole('button', { hidden: true }),
        ).not.toBeInTheDocument();
    });

    it('renders no remove button when disabled', () => {
        renderWithProviders(
            <TagPill label="my tag" disabled onRemove={() => {}} />,
        );
        expect(
            screen.queryByRole('button', { hidden: true }),
        ).not.toBeInTheDocument();
    });
});
