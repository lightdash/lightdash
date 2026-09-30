import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SelectWithFooter } from './SelectWithFooter';

describe('SelectWithFooter', () => {
    it('filters repositories as you type and restores options when cleared', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <SelectWithFooter
                label="Repository"
                value={null}
                searchable
                data={[
                    'lightdash/analytics',
                    'lightdash/demo',
                    'other/project',
                ]}
                footer="Configure repositories"
            />,
        );

        const input = screen.getByRole('textbox', { name: 'Repository' });
        await user.type(input, 'LIGHTDASH');

        expect(input).toHaveValue('LIGHTDASH');
        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['lightdash/analytics', 'lightdash/demo']);

        await user.clear(input);
        await user.type(input, 'analytics');
        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['lightdash/analytics']);

        await user.clear(input);
        await user.type(input, 'missing');
        expect(screen.queryByRole('option')).not.toBeInTheDocument();
        expect(screen.getByText('Configure repositories')).toBeVisible();

        await user.clear(input);
        expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it('updates the search text when the selected repository changes externally', async () => {
        const user = userEvent.setup();
        const props = {
            label: 'Repository',
            searchable: true,
            data: ['lightdash/analytics', 'lightdash/demo'],
            footer: 'Configure repositories',
        };
        const { rerender } = renderWithProviders(
            <SelectWithFooter {...props} value="lightdash/analytics" />,
        );
        const input = screen.getByRole('textbox', { name: 'Repository' });

        await user.clear(input);
        await user.type(input, 'demo');
        expect(input).toHaveValue('demo');
        await user.tab();
        expect(input).toHaveValue('lightdash/analytics');

        rerender(<SelectWithFooter {...props} value="lightdash/demo" />);
        expect(input).toHaveValue('lightdash/demo');

        rerender(<SelectWithFooter {...props} value={null} />);
        expect(input).toHaveValue('');
    });

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
});
