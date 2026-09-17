import { type Item } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import OrderedDataAppVizFieldSelect from './OrderedDataAppVizFieldSelect';

const first = {
    fieldType: 'metric',
    name: 'first',
    label: 'First',
    table: 'orders',
    tableLabel: 'Orders',
} as unknown as Item;
const second = {
    fieldType: 'metric',
    name: 'second',
    label: 'Second',
    table: 'orders',
    tableLabel: 'Orders',
} as unknown as Item;

vi.mock('../../common/FieldSelect', () => ({
    default: ({ onChange }: { onChange: (item: Item) => void }) => (
        <button type="button" onClick={() => onChange(second)}>
            Add field
        </button>
    ),
}));

describe('OrderedDataAppVizFieldSelect', () => {
    it('adds, reorders, and removes the ordered binding with keyboard-accessible controls', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                label="Values"
                items={[first, second]}
                selectedIds={['orders_first', 'orders_second']}
                addDisabled={false}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByLabelText('Move Second up'));
        expect(onChange).toHaveBeenLastCalledWith([
            'orders_second',
            'orders_first',
        ]);

        await user.click(screen.getByLabelText('Remove First'));
        expect(onChange).toHaveBeenLastCalledWith(['orders_second']);

        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                label="Values"
                items={[first, second]}
                selectedIds={['orders_first']}
                addDisabled={false}
                onChange={onChange}
            />,
        );
        await user.click(
            screen.getAllByRole('button', { name: 'Add field' })[1],
        );
        expect(onChange).toHaveBeenLastCalledWith([
            'orders_first',
            'orders_second',
        ]);
    });

    it('keeps the selected order after rerenders and permits a removed field to be added again', async () => {
        const user = userEvent.setup();
        const StatefulPicker = () => {
            const [selectedIds, setSelectedIds] = useState(['orders_first']);
            return (
                <OrderedDataAppVizFieldSelect
                    label="Values"
                    items={[first, second]}
                    selectedIds={selectedIds}
                    addDisabled={false}
                    onChange={setSelectedIds}
                />
            );
        };
        renderWithProviders(<StatefulPicker />);

        await user.click(screen.getByRole('button', { name: 'Add field' }));
        expect(
            screen
                .getAllByText(/^(First|Second)$/)
                .map((node) => node.textContent),
        ).toEqual(['First', 'Second']);

        await user.click(screen.getByLabelText('Move Second up'));
        expect(
            screen
                .getAllByText(/^(First|Second)$/)
                .map((node) => node.textContent),
        ).toEqual(['Second', 'First']);

        await user.click(screen.getByLabelText('Remove Second'));
        expect(screen.queryByText('Second')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Add field' }));
        expect(
            screen
                .getAllByText(/^(First|Second)$/)
                .map((node) => node.textContent),
        ).toEqual(['First', 'Second']);
    });
});
