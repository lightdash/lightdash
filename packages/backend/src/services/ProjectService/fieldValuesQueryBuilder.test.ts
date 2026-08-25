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

const exploreWithFilterAutocomplete = (
    filterAutocomplete: NonNullable<
        Explore['tables'][string]['dimensions'][string]['filterAutocomplete']
    >,
): Explore => ({
    ...validExplore,
    tables: {
        ...validExplore.tables,
        a: {
            ...validExplore.tables.a,
            dimensions: {
                ...validExplore.tables.a.dimensions,
                dim1: {
                    ...validExplore.tables.a.dimensions.dim1,
                    filterAutocomplete,
                },
            },
        },
    },
});

const lookupExplore: Explore = {
    ...validExplore,
    name: 'lookup',
    baseTable: 'lookup',
    joinedTables: [],
    tables: {
        lookup: {
            ...validExplore.tables.a,
            name: 'lookup',
            dimensions: {
                code: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'code',
                    table: 'lookup',
                },
                name: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'name',
                    table: 'lookup',
                },
            },
            metrics: {},
        },
    },
};

const mockExploreResolver = {
    findExploreByTableName: vi.fn(),
    findJoinAliasExplore: vi.fn(),
    findExploreContainingTable: vi.fn(),
};

describe('getFieldValuesMetricQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            validExplore,
        );
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(undefined);
        mockExploreResolver.findExploreContainingTable.mockResolvedValue(
            undefined,
        );
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

    test('returns null staticResults when warehouse fetching is on', async () => {
        const { staticResults } = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'test',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(staticResults).toBeNull();
    });

    test('returns matching curated values as staticResults when warehouse fetching is off', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithFilterAutocomplete({
                fetchFromWarehouse: false,
                values: [
                    { value: 'active', label: 'Active customer' },
                    { value: 'trial' },
                    { value: 'churned' },
                ],
            }),
        );

        const { staticResults } = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'act',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(staticResults).toEqual([
            { value: 'active', label: 'Active customer' },
        ]);
    });

    test('returns empty staticResults when warehouse fetching is off and no values are curated', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(
            exploreWithFilterAutocomplete({ fetchFromWarehouse: false }),
        );

        const { staticResults } = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'anything',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(staticResults).toEqual([]);
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

    test('fetches values from the configured dimension and ignores cascading filters', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            optionsFromDimension: {
                model: 'lookup',
                dimension: 'code',
                labelDimension: 'name',
            },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'lookup' ? lookupExplore : sourceExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'AA',
            limit: 10,
            maxLimit: 5000,
            filters: {
                id: 'filter-group',
                and: [
                    {
                        id: 'cascading-filter',
                        operator: FilterOperator.EQUALS,
                        values: ['foo'],
                        target: { fieldId: 'a_dim1' },
                    },
                ],
            },
            exploreResolver: mockExploreResolver,
        });

        expect(result.explore).toBe(lookupExplore);
        expect(result.fieldId).toBe('lookup_code');
        expect(result.labelFieldId).toBe('lookup_name');
        expect(result.metricQuery).toMatchObject({
            exploreName: 'lookup',
            dimensions: ['lookup_code', 'lookup_name'],
            sorts: [{ fieldId: 'lookup_name', descending: false }],
        });
        const dimensions = result.metricQuery.filters?.dimensions;
        const filterRules =
            dimensions && 'and' in dimensions ? dimensions.and : [];
        expect(filterRules).toHaveLength(2);
        expect(filterRules).not.toContainEqual(
            expect.objectContaining({ id: 'cascading-filter' }),
        );
    });

    test('resolves the options dimension against the explore base table', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            optionsFromDimension: {
                model: 'airlines_explore',
                dimension: 'code',
            },
        });
        // An explore built with `meta.explores` is named differently to the
        // model it is built on.
        const customNameExplore: Explore = {
            ...lookupExplore,
            name: 'airlines_explore',
            baseTable: 'dim_airlines',
            tables: {
                dim_airlines: {
                    ...lookupExplore.tables.lookup,
                    name: 'dim_airlines',
                    dimensions: {
                        code: {
                            ...lookupExplore.tables.lookup.dimensions.code,
                            table: 'dim_airlines',
                        },
                    },
                },
            },
        };
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'airlines_explore'
                    ? customNameExplore
                    : sourceExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'AA',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.fieldId).toBe('dim_airlines_code');
        expect(result.metricQuery.dimensions).toEqual(['dim_airlines_code']);
    });

    test('falls back to the join alias explore for the options model', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            optionsFromDimension: { model: 'lookup_alias', dimension: 'code' },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'lookup_alias' ? undefined : sourceExplore,
        );
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(
            lookupExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'AA',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.explore).toBe(lookupExplore);
        expect(result.fieldId).toBe('lookup_code');
    });

    test('throws an actionable error when the options model has no explore', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            optionsFromDimension: { model: 'hidden_model', dimension: 'code' },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'hidden_model' ? undefined : sourceExplore,
        );

        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: 'AA',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(
            /a_dim1 reads options from model 'hidden_model', which has no explore/,
        );
    });

    test('throws when the options dimension does not exist in the source explore', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            optionsFromDimension: { model: 'lookup', dimension: 'missing' },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'lookup' ? lookupExplore : sourceExplore,
        );

        await expect(
            getFieldValuesMetricQuery({
                projectUuid: 'project-uuid',
                table: 'a',
                initialFieldId: 'a_dim1',
                search: 'AA',
                limit: 10,
                maxLimit: 5000,
                filters: undefined,
                exploreResolver: mockExploreResolver,
            }),
        ).rejects.toThrow(
            "Filter autocomplete options source 'lookup.missing' does not exist",
        );
    });

    test('serves curated values without resolving the options model', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: false,
            values: [{ value: 'AAL' }, { value: 'DAL' }],
            optionsFromDimension: { model: 'lookup', dimension: 'code' },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'lookup' ? undefined : sourceExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'AA',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.staticResults).toEqual([{ value: 'AAL' }]);
        expect(result.fieldId).toBe('a_dim1');
        expect(
            mockExploreResolver.findExploreByTableName,
        ).not.toHaveBeenCalledWith('project-uuid', 'lookup');
    });

    test('ignores the base label dimension when options come from another model', async () => {
        const sourceExplore = exploreWithFilterAutocomplete({
            fetchFromWarehouse: true,
            labelDimension: 'label_dim',
            optionsFromDimension: { model: 'lookup', dimension: 'code' },
        });
        mockExploreResolver.findExploreByTableName.mockImplementation(
            async (_projectUuid: string, table: string) =>
                table === 'lookup' ? lookupExplore : sourceExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'a',
            initialFieldId: 'a_dim1',
            search: 'AA',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(result.labelFieldId).toBeNull();
        expect(result.metricQuery.dimensions).toEqual(['lookup_code']);
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

    test('falls back to an explore containing a joined-only table', async () => {
        mockExploreResolver.findExploreByTableName.mockResolvedValue(undefined);
        mockExploreResolver.findJoinAliasExplore.mockResolvedValue(undefined);
        mockExploreResolver.findExploreContainingTable.mockResolvedValue(
            validExplore,
        );

        const result = await getFieldValuesMetricQuery({
            projectUuid: 'project-uuid',
            table: 'b',
            initialFieldId: 'b_dim1',
            search: '',
            limit: 10,
            maxLimit: 5000,
            filters: undefined,
            exploreResolver: mockExploreResolver,
        });

        expect(
            mockExploreResolver.findExploreContainingTable,
        ).toHaveBeenCalledWith('project-uuid', 'b');
        expect(result.explore).toBe(validExplore);
        expect(result.fieldId).toBe('b_dim1');
        expect(result.metricQuery.exploreName).toBe(validExplore.name);
        expect(result.metricQuery.dimensions).toEqual(['b_dim1']);
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
