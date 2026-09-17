import { getItemLabelWithoutTableName, type Item } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import OrderedDataAppVizFieldSelect from './OrderedDataAppVizFieldSelect';

type FieldSelectProps = {
    item?: Item;
    inactiveItemIds?: string[];
    loading?: boolean;
    onChange: (item: Item | undefined) => void;
    rightSection?: ReactNode;
};

const fieldSelectProps = vi.hoisted(() => [] as FieldSelectProps[]);

const first = {
    fieldType: 'dimension',
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
const third = {
    fieldType: 'metric',
    name: 'third',
    label: 'Third',
    table: 'orders',
    tableLabel: 'Orders',
} as unknown as Item;

vi.mock('../../common/FieldSelect', () => ({
    default: (props: FieldSelectProps) => {
        fieldSelectProps.push(props);
        return (
            <div>
                <span>
                    {props.item && getItemLabelWithoutTableName(props.item)}
                </span>
                {props.rightSection}
            </div>
        );
    },
}));

const header = <span>Values</span>;

describe('OrderedDataAppVizFieldSelect', () => {
    it('adds, replaces in place, prevents duplicates, and adds query fields', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onAddToQuery = vi.fn();
        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                header={header}
                label="Values"
                items={[first, second]}
                addItems={[third]}
                selectedIds={['orders_first', 'orders_second']}
                addDisabled={false}
                onAddToQuery={onAddToQuery}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Add values' }));
        expect(onChange).toHaveBeenLastCalledWith([
            'orders_first',
            'orders_second',
            'orders_third',
        ]);

        act(() => fieldSelectProps[0].onChange(third));
        expect(onAddToQuery).toHaveBeenCalledWith(third);
        expect(onChange).toHaveBeenLastCalledWith([
            'orders_third',
            'orders_second',
        ]);

        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                header={header}
                label="Values"
                items={[first, second, third]}
                selectedIds={['orders_first', 'orders_second']}
                addDisabled={false}
                onChange={onChange}
            />,
        );
        const latestProps = fieldSelectProps.slice(-2);
        expect(latestProps[0].inactiveItemIds).toEqual(['orders_second']);
        act(() => latestProps[0].onChange(second));
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('keeps stateful order when fields are removed, added again, and moved', async () => {
        const user = userEvent.setup();
        const StatefulPicker = () => {
            const [selectedIds, setSelectedIds] = useState([
                'orders_first',
                'orders_second',
            ]);
            return (
                <OrderedDataAppVizFieldSelect
                    header={header}
                    label="Values"
                    items={[first, second]}
                    selectedIds={selectedIds}
                    addDisabled={false}
                    onChange={setSelectedIds}
                />
            );
        };
        renderWithProviders(<StatefulPicker />);

        await user.click(screen.getByLabelText('Remove First'));
        expect(screen.queryByText('First')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Add values' }));
        expect(
            screen
                .getAllByText(/^(First|Second)$/)
                .map((node) => node.textContent),
        ).toEqual(['Second', 'First']);

        await user.click(screen.getByLabelText('Move First up'));
        expect(
            screen
                .getAllByText(/^(First|Second)$/)
                .map((node) => node.textContent),
        ).toEqual(['First', 'Second']);
    });

    it('uses an addable field once the query fields are selected', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onAddToQuery = vi.fn();
        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                header={header}
                label="Values"
                items={[first, second]}
                addItems={[third]}
                selectedIds={['orders_first', 'orders_second']}
                addDisabled={false}
                onAddToQuery={onAddToQuery}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Add values' }));
        expect(onAddToQuery).toHaveBeenCalledWith(third);
        expect(onChange).toHaveBeenCalledWith([
            'orders_first',
            'orders_second',
            'orders_third',
        ]);
    });

    it('keeps removal available when no fields can be added', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                header={header}
                label="Values"
                items={[first]}
                selectedIds={['orders_first']}
                addDisabled={false}
                onChange={onChange}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Add values' }),
        ).toBeDisabled();
        expect(screen.getByLabelText('Remove First')).toBeEnabled();
        await user.click(screen.getByLabelText('Remove First'));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('keeps pending fields removable and reorderable', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithProviders(
            <OrderedDataAppVizFieldSelect
                header={header}
                label="Values"
                items={[first, second]}
                selectedIds={['orders_first', 'orders_second']}
                addDisabled={false}
                isFieldPending={(id) => id === 'orders_first'}
                onChange={onChange}
            />,
        );

        const latestProps = fieldSelectProps.slice(-2);
        expect(latestProps[0].loading).toBeUndefined();
        expect(screen.getByLabelText('Move First down')).toBeEnabled();
        expect(screen.getByLabelText('Remove First')).toBeEnabled();

        await user.click(screen.getByLabelText('Move First down'));
        expect(onChange).toHaveBeenLastCalledWith([
            'orders_second',
            'orders_first',
        ]);
        await user.click(screen.getByLabelText('Remove First'));
        expect(onChange).toHaveBeenLastCalledWith(['orders_second']);
    });
});
