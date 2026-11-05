import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FieldPicker, ParameterPicker } from './ControlPickers';

// A wide project: 2,000 dimensions over 20 tables, all on one tile
const manyFields: FilterableDimension[] = Array.from(
    { length: 2000 },
    (_, index) => ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: `field_${String(index).padStart(4, '0')}`,
        label: `Field ${String(index).padStart(4, '0')}`,
        table: `table_${index % 20}`,
        tableLabel: `Table ${index % 20}`,
        sql: '${TABLE}.field',
        hidden: false,
    }),
);
const tile: DashboardTile = {
    uuid: 'tile-wide',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    tabUuid: undefined,
    properties: { savedChartUuid: 'chart' },
};

describe('FieldPicker', () => {
    afterEach(() => vi.restoreAllMocks());

    it('draws only the rows in view of 2,000 fields, and finds one by search', async () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        const onPick = vi.fn();
        renderWithProviders(
            <FieldPicker
                fields={manyFields}
                availableTileFilters={{ 'tile-wide': manyFields }}
                tiles={[tile]}
                tabs={[]}
                activeTabUuid={undefined}
                onBack={null}
                withinPortal={false}
                onPick={onPick}
            />,
        );
        const options = await screen.findAllByRole('option');
        expect(options.length).toBeGreaterThan(0);
        expect(options.length).toBeLessThan(60);
        expect(options[0]).toHaveAccessibleName(/, Table 0, 1 tile$/);

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Search fields' }),
            'Field 1999',
        );
        await waitFor(() =>
            expect(screen.getAllByRole('option')).toHaveLength(1),
        );
        await userEvent.keyboard('{Enter}');
        expect(onPick).toHaveBeenCalledWith(manyFields[1999]);
        expect(
            screen.queryByRole('button', { name: 'Back' }),
        ).not.toBeInTheDocument();
    });
});

const parameter = (model: string, modelLabel: string) => ({
    key: `${model}.region`,
    source: { type: 'model' as const, modelName: model, modelLabel },
    definition: { label: 'Region', type: 'string' as const },
    tileUuids: ['tile-wide'],
});
const ordersRegion = parameter('orders', 'Orders');
const paymentsRegion = parameter('payments', 'Payments');

describe('ParameterPicker', () => {
    afterEach(() => vi.restoreAllMocks());

    const renderPicker = () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        const onPick = vi.fn();
        renderWithProviders(
            <ParameterPicker
                parameters={[ordersRegion, paymentsRegion]}
                onBack={() => {}}
                withinPortal={false}
                onPick={onPick}
            />,
        );
        return onPick;
    };

    it('picks the first parameter on Enter as soon as it opens', async () => {
        const user = userEvent.setup();
        const onPick = renderPicker();
        await screen.findAllByRole('option');
        screen.getByRole('textbox', { name: 'Search parameters' }).focus();
        await user.keyboard('{Enter}');
        expect(onPick).toHaveBeenCalledWith(ordersRegion);
    });

    it('picks nothing on Enter typed before the search settles', async () => {
        const user = userEvent.setup();
        const onPick = renderPicker();
        await screen.findAllByRole('option');
        await user.type(
            screen.getByRole('textbox', { name: 'Search parameters' }),
            'payments{Enter}',
        );
        expect(onPick).not.toHaveBeenCalled();
        // Once settled, Enter takes the new first match
        await waitFor(() =>
            expect(screen.getAllByRole('option')).toHaveLength(1),
        );
        await user.keyboard('{Enter}');
        expect(onPick).toHaveBeenCalledWith(paymentsRegion);
    });

    it('picks the first parameter on Enter after a search typed and deleted at once', async () => {
        const user = userEvent.setup();
        const onPick = renderPicker();
        await screen.findAllByRole('option');
        await user.type(
            screen.getByRole('textbox', { name: 'Search parameters' }),
            'x{Backspace}',
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        await user.keyboard('{Enter}');
        expect(onPick).toHaveBeenCalledWith(ordersRegion);
    });
});
