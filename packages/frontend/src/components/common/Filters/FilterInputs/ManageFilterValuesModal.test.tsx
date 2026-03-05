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

    it('strips surrounding double quotes from CSV values', () => {
        expect(parseDelimitedValues('"ID_123","ID_456"')).toEqual([
            'ID_123',
            'ID_456',
        ]);
        expect(
            parseDelimitedValues('value\n"ID_123"\n"ID_456"\n"ID_789"'),
        ).toEqual(['ID_123', 'ID_456', 'ID_789']);
        expect(parseDelimitedValues('"alpha"\nbeta\n"gamma"')).toEqual([
            'alpha',
            'beta',
            'gamma',
        ]);
    });

    it('unescapes doubled quotes inside quoted CSV values', () => {
        expect(parseDelimitedValues('"value ""with"" quotes"')).toEqual([
            'value "with" quotes',
        ]);
    });

    it('filters CSV values through validateValue when provided', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onClose = vi.fn();
        const isNumber = (v: string) => /^-?\d+(\.\d+)?$/.test(v);

        renderWithProviders(
            <ManageFilterValuesModal
                opened
                onClose={onClose}
                values={[]}
                onChange={onChange}
                validateValue={isNumber}
            />,
        );

        const csvContent = 'value\n10\nabc\n20.5\nhello\n-3';
        const file = new File([csvContent], 'test.csv', {
            type: 'text/csv',
        });
        // JSDOM File doesn't support .text(), so polyfill it
        file.text = () => Promise.resolve(csvContent);

        // Mantine FileButton renders hidden file inputs with our aria-label
        const fileInputs = screen.getAllByLabelText('Import CSV file');
        await user.upload(fileInputs[0], file);

        // Only numeric values should appear: 10, 20.5, -3
        expect(await screen.findByText('3 values')).toBeInTheDocument();

        // Select all imported values, then apply
        await user.click(screen.getByLabelText('Select all shown'));
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onChange).toHaveBeenCalledWith(['10', '20.5', '-3']);
    });
});
