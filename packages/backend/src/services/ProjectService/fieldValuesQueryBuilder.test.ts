import {
    DimensionType,
    FieldType,
    FilterOperator,
    NotFoundError,
    ParameterError,
    type AndFilterGroup,
    type Explore,
} from '@lightdash/common';
import { getFieldValuesMetricQuery } from './fieldValuesQueryBuilder';
import { validExplore } from './ProjectService.mock';

const exploreWithLabelDimension = (labelDimension: string): Explore => ({
    ...validExplore,
    tables: {
        ...validExplore.tables,
        a: {
            ...validExplore.tables.a,
            dimensions: {
                ...validExplore.tables.a.dimensions,
                dim1: {
                    ...validExplore.tables.a.dimensions.dim1,
                    filterAutocomplete: {
                        fetchFromWarehouse: true,
                        labelDimension,
                    },
                },
                label_dim: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'label_dim',
                    label: 'label_dim',
                    table: 'a',
                    tableLabel: '',
                    sql: '',
                    hidden: false,
                    compiledSql: '',
                    tablesReferences: ['a'],
                },
            },
        },
    },
});

const mockExploreResolver = {
    findExploreByTableName: vi.fn(),
    findJoinAliasExplore: vi.fn(),
};

describe('getFieldValuesMetricQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            validExplore,
        );
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(undefined);
    });

    test('builds a MetricQuery with correct structure', async () => {
        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'test',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.metricQuery.exploreName).toBe(validExplore.name);
        expect(result.metricQuery.dimensions).toEqual(['a_dim1']);
        expect(result.metricQuery.metrics).toEqual([]);
        expect(result.metricQuery.limit).toBe(10);
        expect(result.metricQuery.sorts).toEqual([
            { fieldId: 'a_dim1', descending: false },
        ]);

        const dims = result.metricQuery.filters?.dimensions;
        const filterRules = dims && 'and' in dims ? dims.and : [];
        expect(filterRules).toHaveLength(2);
        expect(filterRules?.[0]).toMatchObject({
            operator: FilterOperator.INCLUDE,
            values: ['test'],
            target: { fieldId: 'a_dim1' },
            caseSensitive: false,
        });
        expect(filterRules?.[1]).toMatchObject({
            operator: FilterOperator.NOT_NULL,
            values: [],
            target: { fieldId: 'a_dim1' },
        });
    });

    test('includes compatible filters from input', async () => {
        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: '',
            limit: 50,
            maxLimit: 5000,
            filters: {
                id: 'filter-group',
                and: [
                    {
                        id: 'valid-filter',
                        operator: FilterOperator.EQUALS,
                        values: ['foo'],
                        target: { fieldId: 'a_dim1' },
                    },
                    {
                        id: 'invalid-filter',
                        operator: FilterOperator.EQUALS,
                        values: ['bar'],
                        target: { fieldId: 'nonexistent_field' },
                    },
                ],
            },
            exploreResolver: mockExploreResolver,
        });

        const dims = result.metricQuery.filters?.dimensions;
        const filterRules = dims && 'and' in dims ? dims.and : [];
        // 2 autocomplete filters + 1 compatible filter (nonexistent_field is excluded)
        expect(filterRules).toHaveLength(3);
    });

    test('falls back to join alias explore when table not found', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(undefined);
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(
            validExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'alias_table',
            initialFieldId: 'alias_table_dim1',
            search: '',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(mockExploreResolver.findJoinAliasExplore).toHaveBeenCalledWith(
            'project-uuid',
            'alias_table',
        );
        // fieldId should be remapped from alias_table to base table
        expect(result.fieldId).toBe('a_dim1');
    });

    test('throws NotFoundError when explore not found', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(undefined);
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(undefined);

        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'nonexistent',
                initialFieldId: 'nonexistent_dim',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    test('throws NotFoundError when field not found in explore', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_nonexistent',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    test('throws ParameterError when field is a metric', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_met1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });

    test('throws ParameterError when limit exceeds max', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10000,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });

    test('throws ParameterError when limit contains SQL tokens at runtime', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: '',
                limit: '1 OFFSET 1',
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow('Query limit must be a non-negative integer');
    });

    test('throws ParameterError when table is empty string', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: '',
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });

    test('throws ParameterError when table is undefined at runtime', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: undefined as unknown as string,
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });

    test('adds label dimension as a second column and searches/sorts by it', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithLabelDimension('label_dim'),
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'test',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.metricQuery.dimensions).toEqual([
            'a_dim1',
            'a_label_dim',
        ]);
        expect(result.metricQuery.sorts).toEqual([
            { fieldId: 'a_label_dim', descending: false },
        ]);
        expect(result.labelFieldId).toBe('a_label_dim');

        const dims = result.metricQuery.filters?.dimensions;
        const filterRules = dims && 'and' in dims ? dims.and : [];
        const searchGroup = filterRules?.[0];
        const orRules =
            searchGroup && 'or' in searchGroup ? searchGroup.or : [];
        expect(orRules).toMatchObject([
            {
                operator: FilterOperator.INCLUDE,
                values: ['test'],
                target: { fieldId: 'a_label_dim' },
            },
            {
                operator: FilterOperator.INCLUDE,
                values: ['test'],
                target: { fieldId: 'a_dim1' },
            },
        ]);
        expect(filterRules?.[1]).toMatchObject({
            operator: FilterOperator.NOT_NULL,
            target: { fieldId: 'a_dim1' },
        });
    });

    test('ignores label dimension that references the value field itself', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithLabelDimension('dim1'),
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: '',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.labelFieldId).toBeNull();
        expect(result.metricQuery.dimensions).toEqual(['a_dim1']);
    });

    test('throws NotFoundError when label dimension does not exist', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithLabelDimension('missing_dim'),
        );

        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    test('throws ParameterError when label dimension is a metric', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithLabelDimension('met1'),
        );

        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });

    test('throws ParameterError when filters is truthy but missing .and', async () => {
        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: '',
                limit: 10,
                maxLimit: 5000,
                filters: { id: 'bad-filter' } as unknown as AndFilterGroup,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(ParameterError);
    });
});
