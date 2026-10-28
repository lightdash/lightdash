import {
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type CompiledDimension,
    type ItemsMap,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import {
    SemanticNodeDetails,
    type SemanticNodeQuery,
} from './SemanticNodeDetails';

const dimension = (
    name: string,
    label: string,
    type: DimensionType,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table: 'users',
    tableLabel: 'Users',
    sql: name,
    compiledSql: name,
    tablesReferences: ['users'],
    hidden: false,
});

const lastActiveAtDay: CompiledDimension = {
    ...dimension(
        'last_active_at_day',
        'Last active at day',
        DimensionType.DATE,
    ),
    timeInterval: TimeFrames.DAY,
};

const fieldsMap: ItemsMap = {
    users_is_deleted: dimension(
        'is_deleted',
        'Is deleted',
        DimensionType.BOOLEAN,
    ),
    users_last_active_at_day: lastActiveAtDay,
};

const metricQuery: SemanticNodeQuery = {
    dimensions: ['users_last_active_at_day'],
    metrics: ['users_count'],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'deleted',
                    target: { fieldId: 'users_is_deleted' },
                    operator: FilterOperator.EQUALS,
                    values: [false],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'users_last_active_at_day', descending: true }],
};

const renderDetails = (
    fields: ItemsMap = fieldsMap,
    query: SemanticNodeQuery = metricQuery,
) =>
    renderWithProviders(
        <MemoryRouter>
            <SemanticNodeDetails
                metricQuery={query}
                fieldsMap={fields}
                parameters={{ region: 'EMEA' }}
            />
        </MemoryRouter>,
    );

describe('SemanticNodeDetails', () => {
    it('shows the fields, filters, parameters and sorts, each icon labelled', () => {
        renderDetails();

        ['Fields', 'Filters', 'Parameters', 'Sorts'].forEach((label) =>
            expect(screen.getByLabelText(label)).toBeInTheDocument(),
        );

        expect(
            screen
                .getAllByTestId('semantic-node-field')
                .map((chip) => chip.textContent),
        ).toEqual(['Last active at day', 'Users count']);
        expect(screen.getByText('Is deleted')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByTestId('semantic-node-sort')).toHaveTextContent(
            'Last active at day',
        );
        expect(screen.getByLabelText('descending')).toBeInTheDocument();
        expect(screen.getByText('Region')).toBeInTheDocument();
        expect(screen.getByText('EMEA')).toBeInTheDocument();
    });

    it('labels fields from their ids while the explore is unavailable', () => {
        renderDetails({}, { ...metricQuery, filters: {}, sorts: [] });

        expect(
            screen
                .getAllByTestId('semantic-node-field')
                .map((chip) => chip.textContent),
        ).toEqual(['Users last active at day', 'Users count']);
    });

    it('hides the fields row for a query without fields', () => {
        renderDetails(fieldsMap, {
            ...metricQuery,
            dimensions: [],
            metrics: [],
        });

        expect(screen.queryByLabelText('Fields')).toBeNull();
    });

    it('shows one sort badge per sort field, in order', () => {
        renderDetails(fieldsMap, {
            ...metricQuery,
            sorts: [
                { fieldId: 'users_last_active_at_day', descending: true },
                { fieldId: 'users_is_deleted', descending: false },
            ],
        });

        expect(
            screen
                .getAllByTestId('semantic-node-sort')
                .map((badge) => badge.textContent),
        ).toEqual(['Last active at day', 'Is deleted']);
        expect(screen.getByLabelText('ascending')).toBeInTheDocument();
    });

    it("formats filter values with the field's type and grain", () => {
        renderDetails(fieldsMap, {
            ...metricQuery,
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'active',
                            target: { fieldId: 'users_last_active_at_day' },
                            operator: FilterOperator.IN_BETWEEN,
                            values: ['2025-01-01', '2025-12-31'],
                        },
                    ],
                },
            },
        });

        expect(
            screen.getByText('2025-01-01 and 2025-12-31'),
        ).toBeInTheDocument();
    });
});
