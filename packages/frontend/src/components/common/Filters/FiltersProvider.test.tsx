import {
    DimensionType,
    FieldType,
    FilterOperator,
    isField,
    type DashboardFilterRule,
    type DashboardFilterableField,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import FiltersProvider from './FiltersProvider';
import useFiltersContext from './useFiltersContext';

const fieldA: DashboardFilterableField = {
    name: 'name',
    table: 'team',
    tableLabel: 'Team at Event A',
    label: 'Name at Event A',
    type: DimensionType.STRING,
    fieldType: FieldType.DIMENSION,
    sql: '${TABLE}.name',
    hidden: false,
};
const fieldB = {
    ...fieldA,
    tableLabel: 'Team at Event B',
    label: 'Name at Event B',
};
const FieldLabel = ({ rule }: { rule: DashboardFilterRule }) => {
    const field = useFiltersContext().getField(rule);
    return (
        <Text>
            {field && isField(field)
                ? `${field.tableLabel} ${field.label}`
                : 'Missing field'}
        </Text>
    );
};

describe('dashboard filter field resolution', () => {
    const rule: DashboardFilterRule = {
        id: 'filter',
        label: undefined,
        operator: FilterOperator.EQUALS,
        values: [],
        target: { fieldId: 'team_name', tableName: 'team' },
        tileTargets: {
            'tile-a': false,
            'tile-b': { fieldId: 'team_name', tableName: 'team' },
        },
    };
    const fieldsByTile = { 'tile-a': [fieldA], 'tile-b': [fieldB] };

    it('labels a filter from the tile it explicitly targets', () => {
        renderWithProviders(
            <FiltersProvider
                itemsMap={{ team_name: fieldA }}
                filterableFieldsByTileUuid={fieldsByTile}
            >
                <FieldLabel rule={rule} />
            </FiltersProvider>,
        );
        expect(
            screen.getByText('Team at Event B Name at Event B'),
        ).toBeVisible();
    });

    it('falls back to the shared map without tile targets', () => {
        renderWithProviders(
            <FiltersProvider
                itemsMap={{ team_name: fieldA }}
                filterableFieldsByTileUuid={fieldsByTile}
            >
                <FieldLabel rule={{ ...rule, tileTargets: undefined }} />
            </FiltersProvider>,
        );
        expect(
            screen.getByText('Team at Event A Name at Event A'),
        ).toBeVisible();
    });
});
