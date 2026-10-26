import {
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type CompiledDimension,
    type ItemsMap,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { SemanticQueryDetails } from './SemanticQueryDetails';
import { type SemanticQueryDetailsQuery } from './useSemanticQuerySummary';

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

const metricQuery: SemanticQueryDetailsQuery = {
    dimensions: ['users_last_active_at_day'],
    metrics: [],
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
    limit: 500,
};

const renderDetails = (
    fields: ItemsMap = fieldsMap,
    query: SemanticQueryDetailsQuery = metricQuery,
) =>
    renderWithProviders(
        <MemoryRouter>
            <SemanticQueryDetails
                metricQuery={query}
                fieldsMap={fields}
                parameters={{ region: 'EMEA' }}
                showFields
                showFilters
                showSortAndLimit
            />
        </MemoryRouter>,
    );

describe('SemanticQueryDetails', () => {
    it('summarises counts and limit, and shows filters, sort and parameters when expanded', () => {
        renderDetails();
        const toggle = screen.getByRole('button', {
            name: 'Fields 1 · Filters 1 · Sort 1 · Parameters 1 · 500 rows',
        });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);

        expect(screen.getByText('Is deleted')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByTestId('semantic-query-sort')).toHaveTextContent(
            'Last active at day',
        );
        expect(screen.getByLabelText('descending')).toBeInTheDocument();
        expect(screen.getByText('Region')).toBeInTheDocument();
        expect(screen.getByText('EMEA')).toBeInTheDocument();
    });

    it('labels fields from their ids while the explore is unavailable', () => {
        renderDetails({}, { ...metricQuery, filters: {}, sorts: [] });
        fireEvent.click(screen.getByRole('button', { name: /^Fields 1/ }));

        expect(
            screen.getByText('Users last active at day'),
        ).toBeInTheDocument();
    });

    it('shows one sort badge per sort field, in order', () => {
        renderDetails(fieldsMap, {
            ...metricQuery,
            sorts: [
                { fieldId: 'users_last_active_at_day', descending: true },
                { fieldId: 'users_is_deleted', descending: false },
            ],
        });
        fireEvent.click(screen.getByRole('button', { name: /Sort 2/ }));

        expect(
            screen
                .getAllByTestId('semantic-query-sort')
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
        fireEvent.click(screen.getByRole('button', { name: /Filters 1/ }));

        expect(
            screen.getByText('2025-01-01 and 2025-12-31'),
        ).toBeInTheDocument();
    });
});
