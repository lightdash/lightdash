import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SelectWithFooter } from './SelectWithFooter';

describe('SelectWithFooter', () => {
    it('keeps grouped options and the footer keyboard-accessible', async () => {
        const onChange = vi.fn();
        const onFooterClick = vi.fn();
        const user = userEvent.setup();

        renderWithProviders(
            <SelectWithFooter
                label="Chart"
                value={null}
                onChange={onChange}
                searchable
                data={[
                    {
                        group: 'Space',
                        items: [{ value: 'chart-1', label: 'Revenue' }],
                    },
                ]}
                footer={
                    <button type="button" onClick={onFooterClick}>
                        Load more
                    </button>
                }
            />,
        );

        const input = screen.getByRole('textbox', { name: 'Chart' });
        await user.click(input);
        expect(input).toHaveAttribute('data-expanded', 'true');
        expect(screen.getByText('Space')).toBeInTheDocument();

        await user.keyboard('{ArrowDown}{Enter}');
        expect(onChange).toHaveBeenCalledWith(
            'chart-1',
            expect.objectContaining({ value: 'chart-1', label: 'Revenue' }),
        );

        fireEvent.click(screen.getByText('Load more'));
        expect(onFooterClick).toHaveBeenCalledOnce();
    });

    it('filters options as the user types', async () => {
        const Harness = () => {
            const [value, setValue] = useState<string | null>(
                'lightdash/lightdash',
            );
            return (
                <SelectWithFooter
                    label="Repository"
                    value={value}
                    onChange={setValue}
                    searchable
                    data={[
                        'lightdash/lightdash',
                        'lightdash/analytics',
                        'acme/dbt',
                    ]}
                    footer={null}
                />
            );
        };
        const user = userEvent.setup();
        renderWithProviders(<Harness />);

        const input = screen.getByRole('textbox', { name: 'Repository' });
        await user.click(input);
        await user.clear(input);
        await user.type(input, 'acme');

        expect(input).toHaveValue('acme');
        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['acme/dbt']);
    });
});
