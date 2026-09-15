import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import FilterFacet, { type FilterFacetMode } from './FilterFacet';

const ControlledFacet = ({ mode = 'multi' }: { mode?: FilterFacetMode }) => {
    const [selected, setSelected] = useState<string[]>([]);
    return (
        <FilterFacet
            label="Owners"
            mode={mode}
            selected={selected}
            onChange={setSelected}
            options={[
                { value: 'david', label: 'David' },
                { value: 'editor', label: 'Editor' },
                { value: 'disabled', label: 'Disabled', disabled: true },
            ]}
            enableSelectAll
            clearable
        />
    );
};

describe('FilterFacet', () => {
    it('exposes keyboard selection state, select-all and focus return', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledFacet />);
        const trigger = screen.getByRole('button', { name: 'Owners' });
        trigger.focus();
        await user.keyboard('{Enter}');
        const dialog = screen.getByRole('dialog');
        const david = within(dialog).getByRole('button', { name: 'David' });
        david.focus();
        await user.keyboard(' ');
        expect(david).toHaveAttribute('aria-pressed', 'true');
        expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
        expect(
            within(dialog).getByRole('button', { name: 'Select all' }),
        ).toHaveAttribute('aria-pressed', 'mixed');
        await user.click(
            within(dialog).getByRole('button', { name: 'Select all' }),
        );
        expect(
            within(dialog).getByRole('button', { name: 'Editor' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(dialog).getByRole('button', { name: 'Disabled' }),
        ).toBeDisabled();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await user.click(
            screen.getByRole('button', { name: 'Clear Owners filter' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Clear Owners filter' }),
        ).not.toBeInTheDocument();
    });

    it('keeps single selection exclusive and closes explicitly', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledFacet mode="single" />);
        await user.click(screen.getByRole('button', { name: 'Owners' }));
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'David' }));
        await user.click(
            within(dialog).getByRole('button', { name: 'Editor' }),
        );
        expect(
            within(dialog).getByRole('button', { name: 'David' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            within(dialog).getByRole('button', { name: 'Editor' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await user.click(
            within(dialog).getByRole('button', { name: 'Close Owners filter' }),
        );
        expect(
            screen.getByRole('button', { name: 'Owners 1' }),
        ).toHaveAttribute('aria-expanded', 'false');
    });
});
