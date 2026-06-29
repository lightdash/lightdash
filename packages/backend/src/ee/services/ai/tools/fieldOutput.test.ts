import {
    DimensionType,
    FieldType,
    MetricType,
    type Explore,
} from '@lightdash/common';
import { fieldToJson, type RenderableField } from './fieldOutput';

const makeExplore = ({
    caseSensitive,
    dimensionCaseSensitive,
}: {
    caseSensitive?: boolean;
    dimensionCaseSensitive?: boolean;
}): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        baseTable: 'orders',
        joinedTables: [],
        caseSensitive,
        tables: {
            orders: {
                dimensions: {
                    status: {
                        name: 'status',
                        table: 'orders',
                        caseSensitive: dimensionCaseSensitive,
                    },
                },
                metrics: {},
            },
        },
    }) as unknown as Explore;

const makeField = (
    overrides: Partial<RenderableField> = {},
): RenderableField => ({
    name: 'status',
    label: 'Status',
    tableName: 'orders',
    fieldType: FieldType.DIMENSION,
    fieldValueType: DimensionType.STRING,
    description: undefined,
    ...overrides,
});

describe('fieldOutput', () => {
    it('returns explicit string dimension case-sensitivity', () => {
        expect(
            fieldToJson({
                field: makeField(),
                explore: makeExplore({
                    caseSensitive: false,
                    dimensionCaseSensitive: true,
                }),
            }).caseSensitiveFilters,
        ).toEqual(true);
    });

    it('falls back to explore case-sensitivity for string dimensions', () => {
        expect(
            fieldToJson({
                field: makeField(),
                explore: makeExplore({ caseSensitive: false }),
            }).caseSensitiveFilters,
        ).toEqual(false);
    });

    it('returns null for non-string dimensions', () => {
        expect(
            fieldToJson({
                field: makeField({ fieldValueType: DimensionType.NUMBER }),
                explore: makeExplore({}),
            }).caseSensitiveFilters,
        ).toBeNull();
    });

    it('returns null for metrics', () => {
        expect(
            fieldToJson({
                field: makeField({
                    fieldType: FieldType.METRIC,
                    fieldValueType: MetricType.COUNT,
                }),
                explore: makeExplore({}),
            }).caseSensitiveFilters,
        ).toBeNull();
    });
});
