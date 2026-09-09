import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    type DashboardFilterableField,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterFieldSelect from './index';

// Two explores relabel the same team join alias
const fields: DashboardFilterableField[] = ['A', 'B'].map((event) => ({
    name: 'name',
    table: 'team',
    tableLabel: `Team at Event ${event}`,
    label: `Name at Event ${event}`,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    sql: '${TABLE}.name',
    hidden: false,
}));

describe('dashboard filter field picker', () => {
    afterEach(() => vi.restoreAllMocks());
    it.each([undefined, 'tab-1'])(
        'shows and selects explore-specific fields on active tab %s',
        async (activeTabUuid) => {
            vi.spyOn(
                HTMLElement.prototype,
                'offsetHeight',
                'get',
            ).mockReturnValue(300);
            vi.spyOn(
                HTMLElement.prototype,
                'offsetWidth',
                'get',
            ).mockReturnValue(400);
            const user = userEvent.setup();
            const onChange = vi.fn();
            renderWithProviders(
                <FilterFieldSelect
                    fields={fields}
                    availableTileFilters={{
                        'tile-0': [fields[0]],
                        'tile-1': [fields[1]],
                    }}
                    tiles={fields.map(
                        (_, index): DashboardTile => ({
                            uuid: `tile-${index}`,
                            tabUuid: `tab-${index}`,
                            type: DashboardTileTypes.SAVED_CHART,
                            x: 0,
                            y: 0,
                            w: 6,
                            h: 4,
                            properties: { savedChartUuid: `chart-${index}` },
                        }),
                    )}
                    tabs={[
                        { uuid: 'tab-0', name: 'A', order: 0 },
                        { uuid: 'tab-1', name: 'B', order: 1 },
                    ]}
                    activeTabUuid={activeTabUuid}
                    selectedField={undefined}
                    onChange={onChange}
                />,
            );
            await user.click(
                screen.getByTestId('FilterConfiguration/FieldSelect'),
            );
            expect(await screen.findByText('Team at Event A')).toBeVisible();
            expect(screen.getByText('Team at Event B')).toBeVisible();
            expect(
                screen
                    .getAllByRole('option')
                    .map((option) => option.textContent),
            ).toEqual(
                activeTabUuid
                    ? ['Name at Event B', 'Name at Event A']
                    : ['Name at Event A', 'Name at Event B'],
            );
            expect(
                screen
                    .getAllByRole('option')
                    .map((option) => option.getAttribute('value')),
            ).toEqual(
                expect.arrayContaining([
                    'team_name::Team at Event A::Name at Event A',
                    'team_name::Team at Event B::Name at Event B',
                ]),
            );
            await user.click(
                screen.getByRole('option', { name: 'Name at Event B' }),
            );
            expect(onChange).toHaveBeenCalledWith(fields[1]);
        },
    );
});
