import {
    DimensionType,
    FilterOperator,
    TimeFrames,
    UnitOfTime,
    type DashboardFilters,
    type Filters,
} from '@lightdash/common';
import { validExplore } from '../ProjectService/ProjectService.mock';
import { assertDashboardMetricFilterBoundaries } from './dashboardFilterBoundaries';

const selection = {
    id: 'status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'a_dim1' },
    values: ['Pending'],
};
const saved: DashboardFilters = {
    dimensions: [
        {
            ...selection,
            target: { fieldId: 'a_dim1', tableName: 'a' },
            label: undefined,
            boundaries: { type: 'string', values: ['Pending', 'Active'] },
        },
    ],
    metrics: [],
    tableCalculations: [],
};

describe('dashboard boundaries on derived queries', () => {
    const validate = (filters: Filters) =>
        assertDashboardMetricFilterBoundaries({
            savedFilters: saved,
            filters,
            tileUuid: 'tile',
            explore: validExplore,
            context: {},
        });

    it('requires the actual underlying-data predicate to constrain the field, not merely a valid source query', () => {
        expect(() =>
            validate({ dimensions: { id: 'and', and: [selection] } }),
        ).not.toThrow();
        for (const filters of [
            {},
            {
                dimensions: {
                    id: 'and',
                    and: [{ ...selection, values: ['Other'] }],
                },
            },
            {
                dimensions: {
                    id: 'or',
                    or: [
                        selection,
                        {
                            ...selection,
                            id: 'escape',
                            operator: FilterOperator.NOT_EQUALS,
                        },
                    ],
                },
            },
            { dimensions: { id: 'and', and: [{ id: 'or', or: [selection] }] } },
        ]) {
            expect(() => validate(filters)).toThrow(
                'Choose one of: Pending, Active.',
            );
        }
    });

    it('validates the effective date-zoom bucket rather than its unzoomed literal', () => {
        const dateField = {
            ...validExplore.tables.a.dimensions.dim1,
            type: DimensionType.DATE,
        };
        const args = {
            savedFilters: {
                ...saved,
                dimensions: [
                    {
                        ...saved.dimensions[0],
                        boundaries: {
                            type: 'date' as const,
                            mode: 'fixed' as const,
                            start: '2026-03-01',
                            end: '2026-03-15',
                        },
                    },
                ],
            },
            tileUuid: 'tile',
            explore: validExplore,
            context: { timezone: 'UTC' },
            filters: {
                dimensions: {
                    id: 'and',
                    and: [{ ...selection, values: ['2026-03-01'] }],
                },
            },
        };
        expect(() =>
            assertDashboardMetricFilterBoundaries({
                ...args,
                fields: { a_dim1: dateField },
            }),
        ).not.toThrow();
        const zoomedField = { ...dateField, timeInterval: TimeFrames.MONTH };
        expect(() =>
            assertDashboardMetricFilterBoundaries({
                ...args,
                fields: { a_dim1: zoomedField },
            }),
        ).toThrow('Choose dates between 2026-03-01 and 2026-03-15.');
    });

    it('revalidates the recorded date selection before a derived query after a calendar rollover', () => {
        const dateExplore = {
            ...validExplore,
            tables: {
                ...validExplore.tables,
                a: {
                    ...validExplore.tables.a,
                    dimensions: {
                        dim1: {
                            ...validExplore.tables.a.dimensions.dim1,
                            type: DimensionType.DATE,
                        },
                    },
                },
            },
        };
        const dateSaved: DashboardFilters = {
            ...saved,
            dimensions: [
                {
                    ...saved.dimensions[0],
                    boundaries: {
                        type: 'date',
                        mode: 'relative',
                        value: 1,
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
            ],
        };
        const validateDate = (now: Date) =>
            assertDashboardMetricFilterBoundaries({
                savedFilters: dateSaved,
                tileUuid: 'tile',
                explore: dateExplore,
                filters: {
                    dimensions: {
                        id: 'and',
                        and: [{ ...selection, values: ['2026-02-10'] }],
                    },
                },
                context: { now, timezone: 'America/New_York' },
            });
        expect(() =>
            validateDate(new Date('2026-04-01T03:59:59Z')),
        ).not.toThrow();
        expect(() => validateDate(new Date('2026-04-01T04:00:00Z'))).toThrow(
            'Choose dates within the last 1 completed month.',
        );
    });
});
