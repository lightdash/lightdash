import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ManageFilterValuesModal } from './ManageFilterValuesModal';
import { parseDelimitedValues } from './ManageFilterValuesModal.utils';

describe('ManageFilterValuesModal', () => {
    it('applies unique values and closes', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onClose = vi.fn();

        renderWithProviders(
            <ManageFilterValuesModal
                opened
                onClose={onClose}
                values={['alpha', 'alpha', 'beta']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onChange).toHaveBeenCalledWith(['alpha', 'beta']);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clears all values and shows empty state', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onClose = vi.fn();

        renderWithProviders(
            <ManageFilterValuesModal
                opened
                onClose={onClose}
                values={['alpha', 'beta']}
                onChange={onChange}
            />,
        );

        const clearAllButton = screen.getByRole('button', {
            name: 'Clear all',
        });
        await user.click(clearAllButton);

        expect(await screen.findByText('No values yet')).toBeInTheDocument();
        expect(clearAllButton).toBeDisabled();
    });

    it('does not apply changes when cancelled', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onClose = vi.fn();

        renderWithProviders(
            <ManageFilterValuesModal
                opened
                onClose={onClose}
                values={['alpha', 'beta']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Clear all' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onChange).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('applies only selected values', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onClose = vi.fn();

        renderWithProviders(
            <ManageFilterValuesModal
                opened
                onClose={onClose}
                values={['alpha', 'beta']}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByLabelText('Select all shown'));
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('parses delimited values with optional header', () => {
        expect(parseDelimitedValues('value\nalpha\nbeta\nbeta\n')).toEqual([
            'alpha',
            'beta',
            'beta',
        ]);
        expect(parseDelimitedValues('values,alpha, beta')).toEqual([
            'alpha',
            'beta',
        ]);
        expect(parseDelimitedValues('alpha\tbeta')).toEqual(['alpha', 'beta']);
    });
});
