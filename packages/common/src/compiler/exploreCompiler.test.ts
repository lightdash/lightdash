import { CompileError } from '../types/errors';
import { friendlyName } from '../types/field';
import { ExploreCompiler, parseAllReferences } from './exploreCompiler';
import {
    compiledExploreWithHiddenJoin,
    compiledExploreWithJoinWithFieldsAndGroups,
    compiledJoinedExploreOverridingAliasAndLabel,
    compiledJoinedExploreOverridingJoinAlias,
    compiledJoinedExploreOverridingJoinLabel,
    compiledJoinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
    compiledJoinedExploreWithSubsetOfFields,
    compiledJoinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
    compiledSimpleJoinedExplore,
    compiledSimpleJoinedExploreWithAlwaysTrue,
    customSqlDimensionWithNoReferences,
    customSqlDimensionWithReferences,
    expectedCompiledCustomSqlDimensionWithNoReferences,
    expectedCompiledCustomSqlDimensionWithReferences,
    exploreCircularDimensionReference,
    exploreCircularDimensionShortReference,
    exploreCircularMetricReference,
    exploreCircularMetricShortReference,
    exploreComplexReference,
    exploreComplexReferenceCompiled,
    exploreMissingBaseTable,
    exploreMissingJoinTable,
    exploreOneEmptyTable,
    exploreOneEmptyTableCompiled,
    exploreReferenceDimension,
    exploreReferenceDimensionCompiled,
    exploreReferenceInJoin,
    exploreReferenceInJoinCompiled,
    exploreTableSelfReference,
    exploreTableSelfReferenceCompiled,
    exploreTableSelfReferenceCompiledSqlWhere,
    exploreTableSelfReferenceSqlWhere,
    exploreWithHiddenJoin,
    exploreWithJoinWithFieldsAndGroups,
    exploreWithMetricNumber,
    exploreWithMetricNumberCompiled,
    exploreWithRequiredAttributes,
    exploreWithRequiredAttributesCompiled,
    joinedExploreOverridingAliasAndLabel,
    joinedExploreOverridingJoinAlias,
    joinedExploreOverridingJoinLabel,
    joinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
    joinedExploreWithSubsetOfFields,
    joinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
    simpleJoinedExplore,
    simpleJoinedExploreWithAlwaysTrue,
    tablesWithMetricsWithFilters,
    warehouseClientMock,
} from './exploreCompiler.mock';

const compiler = new ExploreCompiler(warehouseClientMock);

test('Should compile empty table', () => {
    expect(compiler.compileExplore(exploreOneEmptyTable)).toStrictEqual(
        exploreOneEmptyTableCompiled,
    );
});

test('Should throw error when missing base table', () => {
    expect(() => compiler.compileExplore(exploreMissingBaseTable)).toThrowError(
        CompileError,
    );
});

test('Should throw error when missing joined table', () => {
    expect(() => compiler.compileExplore(exploreMissingJoinTable)).toThrowError(
        CompileError,
    );
});

test('Should throw error when dimension/metric has circular reference', () => {
    expect(() =>
        compiler.compileExplore(exploreCircularDimensionReference),
    ).toThrowError(CompileError);
    expect(() =>
        compiler.compileExplore(exploreCircularDimensionShortReference),
    ).toThrowError(CompileError);
    expect(() =>
        compiler.compileExplore(exploreCircularMetricReference),
    ).toThrowError(CompileError);
    expect(() =>
        compiler.compileExplore(exploreCircularMetricShortReference),
    ).toThrowError(CompileError);
});

test('Should compile table with TABLE reference', () => {
    expect(compiler.compileExplore(exploreTableSelfReference)).toStrictEqual(
        exploreTableSelfReferenceCompiled,
    );
});

test('Should compile table with TABLE reference on sql where', () => {
    expect(
        compiler.compileExplore(exploreTableSelfReferenceSqlWhere),
    ).toStrictEqual(exploreTableSelfReferenceCompiledSqlWhere);
});

test('Should compile table with reference to another dimension', () => {
    expect(compiler.compileExplore(exploreReferenceDimension)).toStrictEqual(
        exploreReferenceDimensionCompiled,
    );
});

test('Should compile table with nested references in dimensions and metrics', () => {
    expect(compiler.compileExplore(exploreComplexReference)).toStrictEqual(
        exploreComplexReferenceCompiled,
    );
});

test('Should compile with a reference to a dimension in a joined table', () => {
    expect(compiler.compileExplore(exploreReferenceInJoin)).toStrictEqual(
        exploreReferenceInJoinCompiled,
    );
});

test('Should compile with a reference to a metric in a non-aggregate metric', () => {
    expect(compiler.compileExplore(exploreWithMetricNumber)).toStrictEqual(
        exploreWithMetricNumberCompiled,
    );
});

describe('Explores with a base table and joined table', () => {
    test('should compile', () => {
        expect(compiler.compileExplore(simpleJoinedExplore)).toStrictEqual(
            compiledSimpleJoinedExplore,
        );
    });
    test('should compile explore with join with fields and a time interval dimension with groups', () => {
        expect(
            compiler.compileExplore(exploreWithJoinWithFieldsAndGroups),
        ).toStrictEqual(compiledExploreWithJoinWithFieldsAndGroups);
    });
    test('should compile with a reference to a dimension in a joined table', () => {
        expect(compiler.compileExplore(exploreReferenceInJoin)).toStrictEqual(
            exploreReferenceInJoinCompiled,
        );
    });
    test('should compile with custom label on join', () => {
        expect(
            compiler.compileExplore(joinedExploreOverridingJoinLabel),
        ).toStrictEqual(compiledJoinedExploreOverridingJoinLabel);
    });
    test('should compile with alias on join', () => {
        expect(
            compiler.compileExplore(joinedExploreOverridingJoinAlias),
        ).toStrictEqual(compiledJoinedExploreOverridingJoinAlias);
    });
    test('should compile with an alias and custom label on join', () => {
        expect(
            compiler.compileExplore(joinedExploreOverridingAliasAndLabel),
        ).toStrictEqual(compiledJoinedExploreOverridingAliasAndLabel);
    });
    test('should compile with a subset of fields selected on join', () => {
        expect(
            compiler.compileExplore(joinedExploreWithSubsetOfFields),
        ).toStrictEqual(compiledJoinedExploreWithSubsetOfFields);
    });
    test('should compile with a subset of fields selected on join what dont include the fields in the join SQL', () => {
        expect(
            compiler.compileExplore(
                joinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
            ),
        ).toStrictEqual(
            compiledJoinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
        );
    });
    test('should compile joins with a join alias and a subset of fields selected on join which dont include the fields in the join SQL', () => {
        expect(
            compiler.compileExplore(
                joinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
            ),
        ).toStrictEqual(
            compiledJoinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
        );
    });
    test('should compile with a hidden join', () => {
        expect(compiler.compileExplore(exploreWithHiddenJoin)).toStrictEqual(
            compiledExploreWithHiddenJoin,
        );
    });
});

describe('Default field labels render for', () => {
    test('uppercase field names', () => {
        expect(friendlyName('MYFIELDID')).toEqual('Myfieldid');
        expect(friendlyName('MY_FIELD_ID')).toEqual('My field id');
    });
    test('camel case names', () => {
        expect(friendlyName('myFieldId')).toEqual('My field id');
    });
    test('snake case names', () => {
        expect(friendlyName('my_field_id')).toEqual('My field id');
    });
    test('names with numbers at the start', () => {
        expect(friendlyName('1_field_id')).toEqual('1 field id');
    });
    test('names with numbers in the middle', () => {
        expect(friendlyName('my_1field_id')).toEqual('My 1field id');
    });
});

describe('Compile metrics with filters', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('04 Apr 2020 00:12:00 GMT').getTime());
    });
    afterAll(() => {
        jest.useFakeTimers();
    });
    test('should show filters as columns metric1', () => {
        expect(
            compiler.compileMetric(
                tablesWithMetricsWithFilters.table1.metrics.metric1,
                tablesWithMetricsWithFilters,
            ).compiledSql,
        ).toStrictEqual(
            `MAX(CASE WHEN (LOWER("table1".shared) LIKE LOWER('%foo%')) THEN ("table1".number_column) ELSE NULL END)`,
        );
    });
    test('should show filters as columns metric2', () => {
        expect(
            compiler.compileMetric(
                tablesWithMetricsWithFilters.table2.metrics.metric2,
                tablesWithMetricsWithFilters,
            ).compiledSql,
        ).toStrictEqual(
            `MAX(CASE WHEN (("table2".dim2) < (10) AND ("table2".dim2) > (5)) THEN ("table2".number_column) ELSE NULL END)`,
        );
    });

    test('should show filters as columns metric with sql', () => {
        expect(
            compiler.compileMetric(
                tablesWithMetricsWithFilters.table1.metrics.metric_with_sql,
                tablesWithMetricsWithFilters,
            ).compiledSql,
        ).toStrictEqual(
            `MAX(CASE WHEN (LOWER("table1".shared) LIKE LOWER('%foo%')) THEN (CASE WHEN "table1".number_column THEN 1 ELSE 0 END) ELSE NULL END)`,
        );
    });
});

describe('Parse dimension reference', () => {
    test('should parse dimensions', () => {
        expect(parseAllReferences('${dimension} == 1', 'table')).toStrictEqual([
            { refName: 'dimension', refTable: 'table' },
        ]);
        expect(parseAllReferences('${table.dimension}', 'table')).toStrictEqual(
            [{ refName: 'dimension', refTable: 'table' }],
        );
    });
    test('should parse TABLE', () => {
        expect(parseAllReferences('${TABLE}', 'table')).toStrictEqual([
            { refName: 'TABLE', refTable: 'table' },
        ]);
    });
    test('should not parse lightdash attribute', () => {
        expect(
            parseAllReferences('${lightdash.attribute.country}', 'table'),
        ).toStrictEqual([]);
    });

    test('should not parse short lightdash attribute', () => {
        expect(parseAllReferences('${ld.attr.country}', 'table')).toStrictEqual(
            [],
        );
    });

    test('should parse references with lightdash prefix', () => {
        expect(
            parseAllReferences('${lightdash_dimension} == 1', 'table'),
        ).toStrictEqual([
            { refName: 'lightdash_dimension', refTable: 'table' },
        ]);
        expect(
            parseAllReferences('${dimension_lightdash} == 1', 'table'),
        ).toStrictEqual([
            { refName: 'dimension_lightdash', refTable: 'table' },
        ]);
        expect(
            parseAllReferences(
                '${lightdash_table.dimension}',
                'lightdash_table',
            ),
        ).toStrictEqual([
            { refName: 'dimension', refTable: 'lightdash_table' },
        ]);
        expect(
            parseAllReferences(
                '${table_lightdash.dimension}',
                'table_lightdash',
            ),
        ).toStrictEqual([
            { refName: 'dimension', refTable: 'table_lightdash' },
        ]);
        expect(
            parseAllReferences('${ld_dimension} == 1', 'table'),
        ).toStrictEqual([{ refName: 'ld_dimension', refTable: 'table' }]);
        expect(
            parseAllReferences('${ld_table.ld_dimension} == 1', 'ld_table'),
        ).toStrictEqual([{ refName: 'ld_dimension', refTable: 'ld_table' }]);
    });
});

describe('Explore with user attributes', () => {
    test('should compile explore with table and field required attributes', () => {
        expect(
            compiler.compileExplore(exploreWithRequiredAttributes),
        ).toStrictEqual(exploreWithRequiredAttributesCompiled);
    });
});

describe('Explore with always true join', () => {
    test('should compile explore with always true join', () => {
        expect(
            compiler.compileExplore(simpleJoinedExploreWithAlwaysTrue),
        ).toStrictEqual(compiledSimpleJoinedExploreWithAlwaysTrue);
    });
});

describe('Compiled custom dimensions', () => {
    test('should compile custom dimension with no references', () => {
        expect(
            compiler.compileCustomDimension(
                customSqlDimensionWithNoReferences,
                simpleJoinedExplore.tables,
            ),
        ).toStrictEqual(expectedCompiledCustomSqlDimensionWithNoReferences);
    });
    test('should compile custom dimension with references', () => {
        expect(
            compiler.compileCustomDimension(
                customSqlDimensionWithReferences,
                simpleJoinedExplore.tables,
            ),
        ).toStrictEqual(expectedCompiledCustomSqlDimensionWithReferences);
    });
});
