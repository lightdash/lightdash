import { SupportedDbtAdapter } from '../types/dbt';
import { CompileError } from '../types/errors';
import { DimensionType, FieldType, friendlyName } from '../types/field';
import {
    ExploreCompiler,
    parseAllReferences,
    type UncompiledExplore,
} from './exploreCompiler';
import {
    compiledExploreWithHiddenJoin,
    compiledExploreWithJoinWithFieldsAndGroups,
    compiledExploreWithParameters,
    compiledJoinedExploreOverridingAliasAndLabel,
    compiledJoinedExploreOverridingJoinAlias,
    compiledJoinedExploreOverridingJoinDescription,
    compiledJoinedExploreOverridingJoinLabel,
    compiledJoinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
    compiledJoinedExploreWithSubsetOfFields,
    compiledJoinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
    compiledJoinedExploreWithTwoJoinsToTheSameTable,
    compiledSimpleJoinedExplore,
    compiledSimpleJoinedExploreWithAlwaysTrue,
    compiledSimpleJoinedExploreWithBaseTableDescription,
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
    exploreWithInvalidParameterReference,
    exploreWithJoinWithFieldsAndGroups,
    exploreWithMetricNumber,
    exploreWithMetricNumberCompiled,
    exploreWithParameters,
    exploreWithRequiredAttributes,
    exploreWithRequiredAttributesCompiled,
    joinedExploreOverridingAliasAndLabel,
    joinedExploreOverridingJoinAlias,
    joinedExploreOverridingJoinDescription,
    joinedExploreOverridingJoinLabel,
    joinedExploreWithJoinAliasAndSubsetOfFieldsThatDontIncludeSqlFields,
    joinedExploreWithSubsetOfFields,
    joinedExploreWithSubsetOfFieldsThatDontIncludeSqlFields,
    joinedExploreWithTwoJoinsToTheSameTable,
    simpleJoinedExplore,
    simpleJoinedExploreWithAlwaysTrue,
    simpleJoinedExploreWithBaseTableDescription,
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
    test('should compile with 2 joins to the same table, one without alias and one with alias', () => {
        expect(
            compiler.compileExplore(joinedExploreWithTwoJoinsToTheSameTable),
        ).toStrictEqual(compiledJoinedExploreWithTwoJoinsToTheSameTable);
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
    test('should use base table description when join has no description override', () => {
        expect(
            compiler.compileExplore(
                simpleJoinedExploreWithBaseTableDescription,
            ),
        ).toStrictEqual(compiledSimpleJoinedExploreWithBaseTableDescription);
    });
    test('should override base table description with join description', () => {
        expect(
            compiler.compileExplore(joinedExploreOverridingJoinDescription),
        ).toStrictEqual(compiledJoinedExploreOverridingJoinDescription);
    });
});
describe('Default field labels render correctly for various input formats', () => {
    test('should handle uppercase field names', () => {
        expect(friendlyName('MYFIELDID')).toEqual('Myfieldid');
        expect(friendlyName('MY_FIELD_ID')).toEqual('My field id');
    });

    test('should handle camel case names', () => {
        expect(friendlyName('myFieldId')).toEqual('My field id');
    });

    test('should handle snake case names', () => {
        expect(friendlyName('my_field_id')).toEqual('My field id');
    });

    test('should handle names with numbers at the start', () => {
        expect(friendlyName('1_field_id')).toEqual('1 field id');
    });
    test('should handle names with numbers in the middle', () => {
        expect(friendlyName('my_1field_id')).toEqual('My 1field id');
    });
    test('should handle numbers in the input', () => {
        expect(friendlyName('numberrange1')).toBe('Numberrange 1');
        expect(friendlyName('numberrange_14')).toBe('Numberrange 14');
        expect(friendlyName('date9')).toBe('Date 9');
    });

    const commonCases = [
        ['customer_id', 'Customer id'],
        ['first_name', 'First name'],
        ['last_name', 'Last name'],
        ['created', 'Created'],
        ['payment_id', 'Payment id'],
        ['order_id', 'Order id'],
        ['payment_method', 'Payment method'],
        ['amount', 'Amount'],
    ];
    test.each(commonCases)(
        'should handle common case %s',
        (input, expected) => {
            expect(friendlyName(input)).toBe(expected);
        },
    );

    test('should handle empty strings', () => {
        expect(friendlyName('')).toBe('');
    });

    test('should handle all uppercase input', () => {
        expect(friendlyName('TIMESTAMP_EST')).toBe('Timestamp est');
    });
    test('should handle mixed case input', () => {
        expect(friendlyName('Timestamp_EST')).toBe('Timestamp est');
    });

    const underscoreCases = [
        ['created_by_first_name', 'Created by first name'],
        ['order_date', 'Order date'],
        ['customer_lifetime_value', 'Customer lifetime value'],
        ['days_since_last_order', 'Days since last order'],
        [
            'days_between_created_and_first_order',
            'Days between created and first order',
        ],
    ];
    test.each(underscoreCases)(
        'should handle multiple underscores %s',
        (input, expected) => {
            expect(friendlyName(input)).toBe(expected);
        },
    );

    const edgeCases = [
        ['_timestamp_', 'Timestamp'],
        ['__timestamp__', 'Timestamp'],
        ['timestamp__EST', 'Timestamp est'],
        ['timestamp_EST_', 'Timestamp est'],
    ];
    test.each(edgeCases)('should handle edge case %s', (input, expected) => {
        expect(friendlyName(input)).toBe(expected);
    });

    const specialCases = [
        ['timestamp_tz', 'Timestamp tz'],
        ['timestamp_ntz', 'Timestamp ntz'],
        ['timestamp_ltz', 'Timestamp ltz'],
        ['event_id', 'Event id'],
        ['context_app_version', 'Context app version'],
    ];
    test.each(specialCases)(
        'should handle special case %s',
        (input, expected) => {
            expect(friendlyName(input)).toBe(expected);
        },
    );

    const additionalCases = [
        ['name_with-dash', 'Name with dash'],
        ['name_with.dot', 'Name with dot'],
        ['name_with/slash', 'Name with slash'],
        ['Customer_ID', 'Customer id'],
        ['User_Name', 'User name'],
    ];
    test.each(additionalCases)(
        'should handle special characters and mixed case %s',
        (input, expected) => {
            expect(friendlyName(input)).toBe(expected);
        },
    );
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
                [],
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
                [],
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
                [],
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
                [],
            ),
        ).toStrictEqual(expectedCompiledCustomSqlDimensionWithNoReferences);
    });
    test('should compile custom dimension with references', () => {
        expect(
            compiler.compileCustomDimension(
                customSqlDimensionWithReferences,
                simpleJoinedExplore.tables,
                [],
            ),
        ).toStrictEqual(expectedCompiledCustomSqlDimensionWithReferences);
    });
});

describe('Explore compilation with model-level parameters', () => {
    describe('Parameter inheritance on tables', () => {
        test('should compile explore with table parameters', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            expect(result).toStrictEqual(compiledExploreWithParameters);
        });

        test('should copy parameters to compiled tables', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            expect(result.tables.a.parameters).toEqual({
                region: {
                    label: 'Region',
                    description: 'Filter by region',
                    default: 'US',
                },
            });

            expect(result.tables.b.parameters).toEqual({
                active_status: {
                    label: 'Active Status',
                    description: 'Define active status',
                    default: 'active',
                },
            });
        });

        test('should track parameter references in joins', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            expect(result.joinedTables[0].parameterReferences).toEqual([
                'b.active_status',
            ]);
        });
    });

    describe('Parameter validation in joins', () => {
        test('should throw error for invalid parameter references', () => {
            expect(() =>
                compiler.compileExplore(exploreWithInvalidParameterReference),
            ).toThrowError(CompileError);
        });

        test('should throw error with descriptive message for missing parameters', () => {
            expect(() =>
                compiler.compileExplore(exploreWithInvalidParameterReference),
            ).toThrow('Missing parameters: b.nonexistent_param');
        });
    });

    describe('Parameter resolution in join conditions', () => {
        test('should preserve parameter references in compiled SQL', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            expect(result.joinedTables[0].compiledSqlOn).toContain(
                '${ld.parameters.b.active_status}',
            );
        });

        test('should compile table references but preserve parameter references', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            const compiledSql = result.joinedTables[0].compiledSqlOn;
            expect(compiledSql).toContain('"a".dim1');
            expect(compiledSql).toContain('"b".dim1');
            expect(compiledSql).toContain('${ld.parameters.b.active_status}');
        });

        test('should track both table and parameter references', () => {
            const result = compiler.compileExplore(exploreWithParameters);

            expect(result.joinedTables[0].tablesReferences).toEqual(['a', 'b']);
            expect(result.joinedTables[0].parameterReferences).toEqual([
                'b.active_status',
            ]);
        });
    });

    describe('Parameter scoping across joined tables', () => {
        test('should validate parameter exists in correct table scope', () => {
            expect(() =>
                compiler.compileExplore(exploreWithInvalidParameterReference),
            ).toThrow('Missing parameters: b.nonexistent_param');
        });

        test('should allow parameters from any table in the explore', () => {
            const exploreWithMultipleParamReferences = {
                ...exploreWithParameters,
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: "${a.dim1} = ${b.dim1} AND ${ld.parameters.a.region} = 'US' AND ${ld.parameters.b.active_status} = 'active'",
                    },
                ],
            };

            expect(() =>
                compiler.compileExplore(exploreWithMultipleParamReferences),
            ).not.toThrow();
        });
    });

    describe('Edge cases', () => {
        test('should handle join with no parameters', () => {
            const exploreWithoutParams = {
                ...exploreWithParameters,
                tables: {
                    ...exploreWithParameters.tables,
                    a: {
                        ...exploreWithParameters.tables.a,
                        parameters: {},
                    },
                    b: {
                        ...exploreWithParameters.tables.b,
                        parameters: {},
                    },
                },
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: '${a.dim1} = ${b.dim1}',
                    },
                ],
            };

            expect(() =>
                compiler.compileExplore(exploreWithoutParams),
            ).not.toThrow();
        });

        test('should handle tables with undefined parameters', () => {
            const exploreWithUndefinedParams = {
                ...exploreWithParameters,
                tables: {
                    ...exploreWithParameters.tables,
                    a: {
                        ...exploreWithParameters.tables.a,
                        parameters: undefined,
                    },
                    b: {
                        ...exploreWithParameters.tables.b,
                        parameters: undefined,
                    },
                },
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: '${a.dim1} = ${b.dim1}',
                    },
                ],
            };

            expect(() =>
                compiler.compileExplore(exploreWithUndefinedParams),
            ).not.toThrow();
        });

        test('should handle mixed project and model parameter syntax', () => {
            const exploreWithMixedSyntax = {
                ...exploreWithParameters,
                // Add project-level parameters
                projectParameters: {
                    region: {
                        label: 'Global Region',
                        description: 'Global region filter',
                        default: 'US',
                    },
                },
                tables: {
                    ...exploreWithParameters.tables,
                    b: {
                        ...exploreWithParameters.tables.b,
                        parameters: {
                            active_status: {
                                label: 'Active Status',
                                description:
                                    'Define what constitutes an active order',
                                default: 'active',
                            },
                        },
                    },
                },
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: "${a.dim1} = ${b.dim1} AND ${ld.parameters.b.active_status} = 'active' AND ${ld.parameters.region} = 'US'",
                    },
                ],
            };

            const result = compiler.compileExplore(exploreWithMixedSyntax);
            expect(result.joinedTables[0].parameterReferences).toEqual([
                'b.active_status',
                'region',
            ]);
        });

        test('should allow same parameter name at project and model levels without conflict', () => {
            const exploreWithSameNamedParams = {
                ...exploreWithParameters,
                projectParameters: {
                    region: {
                        label: 'Global Region',
                        description: 'Global region filter',
                        default: 'US',
                    },
                    status: {
                        label: 'Global Status',
                        description: 'Global status filter',
                        default: 'active',
                    },
                },
                tables: {
                    ...exploreWithParameters.tables,
                    a: {
                        ...exploreWithParameters.tables.a,
                        parameters: {
                            region: {
                                label: 'Table A Region',
                                description: 'Region specific to table A',
                                default: 'EU',
                            },
                        },
                    },
                    b: {
                        ...exploreWithParameters.tables.b,
                        parameters: {
                            status: {
                                label: 'Table B Status',
                                description: 'Status specific to table B',
                                default: 'inactive',
                            },
                        },
                    },
                },
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: "${a.dim1} = ${b.dim1} AND ${ld.parameters.region} = 'US' AND ${ld.parameters.a.region} = 'EU' AND ${ld.parameters.status} = 'active' AND ${ld.parameters.b.status} = 'inactive'",
                    },
                ],
            };

            // This should NOT throw an error because parameters are properly scoped
            expect(() =>
                compiler.compileExplore(exploreWithSameNamedParams),
            ).not.toThrow();

            const result = compiler.compileExplore(exploreWithSameNamedParams);

            // Should track all scoped parameters correctly
            expect(result.joinedTables[0].parameterReferences).toEqual([
                'region',
                'a.region',
                'status',
                'b.status',
            ]);

            // Model parameters should be preserved on compiled tables
            expect(result.tables.a.parameters).toEqual({
                region: {
                    label: 'Table A Region',
                    description: 'Region specific to table A',
                    default: 'EU',
                },
            });

            expect(result.tables.b.parameters).toEqual({
                status: {
                    label: 'Table B Status',
                    description: 'Status specific to table B',
                    default: 'inactive',
                },
            });
        });

        test('should handle complex scoping scenarios with multiple same-named parameters', () => {
            const exploreWithComplexScoping = {
                ...exploreWithParameters,
                projectParameters: {
                    date_range: {
                        label: 'Global Date Range',
                        description: 'Global date filter',
                        default: '2024-01-01',
                    },
                },
                tables: {
                    ...exploreWithParameters.tables,
                    a: {
                        ...exploreWithParameters.tables.a,
                        parameters: {
                            date_range: {
                                label: 'Table A Date Range',
                                description: 'Date range for table A',
                                default: '2024-02-01',
                            },
                        },
                    },
                    b: {
                        ...exploreWithParameters.tables.b,
                        parameters: {
                            date_range: {
                                label: 'Table B Date Range',
                                description: 'Date range for table B',
                                default: '2024-03-01',
                            },
                        },
                    },
                },
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: "${a.dim1} = ${b.dim1} AND ${ld.parameters.date_range} >= '2024-01-01' AND ${ld.parameters.a.date_range} >= '2024-02-01' AND ${lightdash.parameters.b.date_range} >= '2024-03-01'",
                    },
                ],
            };

            expect(() =>
                compiler.compileExplore(exploreWithComplexScoping),
            ).not.toThrow();

            const result = compiler.compileExplore(exploreWithComplexScoping);
            expect(result.joinedTables[0].parameterReferences).toEqual([
                'date_range',
                'a.date_range',
                'b.date_range',
            ]);
        });
    });

    describe('Field Sets', () => {
        it('should expand field sets in join.fields', () => {
            const explore: UncompiledExplore = {
                name: 'test_explore',
                label: 'Test Explore',
                tags: [],
                baseTable: 'a',
                groupLabel: undefined,
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: '${a.dim1} = ${b.dim1}',
                        fields: ['all_fields*', '-dim3'],
                    },
                ],
                tables: {
                    a: {
                        name: 'a',
                        label: 'a',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'test.a',
                        dimensions: {
                            dim1: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim1',
                                label: 'Dim 1',
                                table: 'a',
                                tableLabel: 'a',
                                sql: '${TABLE}.dim1',
                                hidden: false,
                                index: 0,
                            },
                        },
                        metrics: {},
                        lineageGraph: {},
                    },
                    b: {
                        name: 'b',
                        label: 'b',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'test.b',
                        dimensions: {
                            dim1: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim1',
                                label: 'Dim 1',
                                table: 'b',
                                tableLabel: 'b',
                                sql: '${TABLE}.dim1',
                                hidden: false,
                                index: 0,
                            },
                            dim2: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim2',
                                label: 'Dim 2',
                                table: 'b',
                                tableLabel: 'b',
                                sql: '${TABLE}.dim2',
                                hidden: false,
                                index: 1,
                            },
                            dim3: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim3',
                                label: 'Dim 3',
                                table: 'b',
                                tableLabel: 'b',
                                sql: '${TABLE}.dim3',
                                hidden: false,
                                index: 2,
                            },
                        },
                        metrics: {},
                        lineageGraph: {},
                        sets: {
                            id_fields: {
                                fields: ['dim1', 'dim2'],
                            },
                            all_fields: {
                                fields: ['id_fields*', 'dim3'],
                            },
                        },
                    },
                },
                targetDatabase: SupportedDbtAdapter.POSTGRES,
                meta: {},
            };

            const result = compiler.compileExplore(explore);

            // Should include dim1 and dim2 from id_fields, but exclude dim3
            expect(result.tables.b.dimensions).toHaveProperty('dim1');
            expect(result.tables.b.dimensions).toHaveProperty('dim2');
            expect(result.tables.b.dimensions).not.toHaveProperty('dim3');
        });

        it('should throw error for non-existent set in join', () => {
            const explore: UncompiledExplore = {
                name: 'test_explore',
                label: 'Test Explore',
                tags: [],
                baseTable: 'a',
                groupLabel: undefined,
                joinedTables: [
                    {
                        table: 'b',
                        sqlOn: '${a.dim1} = ${b.dim1}',
                        fields: ['nonexistent_set*'],
                    },
                ],
                tables: {
                    a: {
                        name: 'a',
                        label: 'a',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'test.a',
                        dimensions: {
                            dim1: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim1',
                                label: 'Dim 1',
                                table: 'a',
                                tableLabel: 'a',
                                sql: '${TABLE}.dim1',
                                hidden: false,
                                index: 0,
                            },
                        },
                        metrics: {},
                        lineageGraph: {},
                    },
                    b: {
                        name: 'b',
                        label: 'b',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'test.b',
                        dimensions: {
                            dim1: {
                                fieldType: FieldType.DIMENSION,
                                type: DimensionType.STRING,
                                name: 'dim1',
                                label: 'Dim 1',
                                table: 'b',
                                tableLabel: 'b',
                                sql: '${TABLE}.dim1',
                                hidden: false,
                                index: 0,
                            },
                        },
                        metrics: {},
                        lineageGraph: {},
                    },
                },
                targetDatabase: SupportedDbtAdapter.POSTGRES,
                meta: {},
            };

            expect(() => compiler.compileExplore(explore)).toThrow(
                /Set "nonexistent_set" not found/,
            );
        });
    });
});
