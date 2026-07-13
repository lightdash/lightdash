import { Button } from '@mantine-8/core';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { MultiSelectCombobox } from './MultiSelectCombobox';

const defaultProps = {
    options: [{ value: 'chart-1', label: 'Chart one' }],
    value: [] as string[],
    searchValue: '',
    onSearchChange: vi.fn(),
    onValueRemove: vi.fn(),
    onOptionSubmit: vi.fn(),
};

describe('MultiSelectCombobox', () => {
    it('keeps an action footer usable without closing the dropdown', async () => {
        const user = userEvent.setup();
        const onLoadMore = vi.fn();

        renderWithProviders(
            <MultiSelectCombobox
                {...defaultProps}
                label="Charts"
                footer={<Button onClick={onLoadMore}>Load more</Button>}
            />,
        );

        const textbox = screen.getByRole('textbox', { name: 'Charts' });
        await user.click(textbox);
        const loadMore = screen.getByRole('button', {
            name: 'Load more',
            hidden: true,
        });
        fireEvent.mouseDown(loadMore);
        fireEvent.click(loadMore);

        expect(onLoadMore).toHaveBeenCalledOnce();
        expect(textbox).toHaveAttribute('data-expanded', 'true');
    });

    it('serializes the complete selected value list', () => {
        const { container } = renderWithProviders(
            <MultiSelectCombobox
                {...defaultProps}
                value={['chart-1']}
                selectedValues={['chart-1', 'chart-2']}
                name="savedChartsUuids"
            />,
        );

        const hiddenInput = container.querySelector<HTMLInputElement>(
            'input[name="savedChartsUuids"]',
        );
        expect(hiddenInput?.value).toBe('chart-1,chart-2');
    });

    it('ignores duplicate option values instead of crashing', async () => {
        const user = userEvent.setup();
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        renderWithProviders(
            <MultiSelectCombobox
                {...defaultProps}
                options={[
                    { value: 'duplicate', label: 'First' },
                    { value: 'duplicate', label: 'Second' },
                ]}
            />,
        );

        await user.click(screen.getByRole('textbox'));

        expect(screen.getAllByRole('option', { hidden: true })).toHaveLength(1);
        consoleError.mockRestore();
    });

    it('leaves selected option colors overridable by consumer CSS', () => {
        renderWithProviders(
            <MultiSelectCombobox
                {...defaultProps}
                value={['chart-1']}
                selectedValues={['chart-1']}
            />,
        );

        fireEvent.focus(screen.getByRole('textbox'));

        const option = screen.getByRole('option', {
            name: 'Chart one',
            hidden: true,
        });
        expect(option).toHaveAttribute('data-combobox-active', 'true');
        expect(option.style.backgroundColor).toBe('');
    });
});
