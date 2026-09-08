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
    exploreName: 'event_a',
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
    exploreName: 'event_b',
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

describe('dashboard filter metadata resolution', () => {
    it.each([true, false])(
        'uses the matching explore label (stored explore: %s)',
        (hasExploreName) => {
            const rule: DashboardFilterRule = {
                id: 'filter',
                label: undefined,
                operator: FilterOperator.EQUALS,
                values: [],
                target: {
                    fieldId: 'team_name',
                    tableName: 'team',
                    ...(hasExploreName ? { exploreName: 'event_b' } : {}),
                },
                tileTargets: {
                    'tile-a': hasExploreName
                        ? { fieldId: 'team_name', tableName: 'team' }
                        : false,
                    'tile-b': hasExploreName
                        ? false
                        : { fieldId: 'team_name', tableName: 'team' },
                },
            };
            renderWithProviders(
                <FiltersProvider
                    itemsMap={{
                        'event_a:team_name': fieldA,
                        'event_b:team_name': fieldB,
                    }}
                    filterableFieldsByTileUuid={{
                        'tile-a': [fieldA],
                        'tile-b': [fieldB],
                    }}
                >
                    <FieldLabel rule={rule} />
                </FiltersProvider>,
            );
            expect(
                screen.getByText('Team at Event B Name at Event B'),
            ).toBeVisible();
        },
    );
    it('supports unqualified metadata and does not substitute another explore for a missing scoped field', () => {
        const rule: DashboardFilterRule = {
            id: 'filter',
            label: undefined,
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'team_name', tableName: 'team' },
            values: [],
        };
        const { rerender } = renderWithProviders(
            <FiltersProvider itemsMap={{ team_name: fieldA }}>
                <FieldLabel rule={rule} />
            </FiltersProvider>,
        );
        expect(
            screen.getByText('Team at Event A Name at Event A'),
        ).toBeVisible();
        rerender(
            <FiltersProvider itemsMap={{ 'event_a:team_name': fieldA }}>
                <FieldLabel rule={rule} />
            </FiltersProvider>,
        );
        expect(
            screen.getByText('Team at Event A Name at Event A'),
        ).toBeVisible();
        rerender(
            <FiltersProvider itemsMap={{ 'event_a:team_name': fieldA }}>
                <FieldLabel
                    rule={{
                        ...rule,
                        target: { ...rule.target, exploreName: 'event_b' },
                    }}
                />
            </FiltersProvider>,
        );
        expect(screen.getByText('Missing field')).toBeVisible();
    });
});
