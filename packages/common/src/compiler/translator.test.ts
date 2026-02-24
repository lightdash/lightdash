import { SupportedDbtAdapter, type DbtModelNode } from '../types/dbt';
import { type Explore } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { TimeFrames } from '../types/timeFrames';
import { warehouseClientMock } from './exploreCompiler.mock';
import {
    attachTypesToModels,
    convertExplores,
    convertTable,
} from './translator';
import {
    DBT_METRIC,
    DBT_METRIC_DERIVED,
    DBT_METRIC_WITH_CUSTOM_SQL,
    DBT_METRIC_WITH_FILTER,
    DBT_METRIC_WITH_SQL_FIELD,
    DBT_V9_METRIC,
    expectedModelWithType,
    LIGHTDASH_TABLE_SQL_WHERE,
    LIGHTDASH_TABLE_WITH_ADDITIONAL_DIMENSIONS,
    LIGHTDASH_TABLE_WITH_AI_HINT,
    LIGHTDASH_TABLE_WITH_AI_HINT_ARRAY,
    LIGHTDASH_TABLE_WITH_AI_HINT_FROM_CONFIG,
    LIGHTDASH_TABLE_WITH_COMPOSITE_PRIMARY_KEY,
    LIGHTDASH_TABLE_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
    LIGHTDASH_TABLE_WITH_DBT_METRICS,
    LIGHTDASH_TABLE_WITH_DBT_V9_METRICS,
    LIGHTDASH_TABLE_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
    LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_BIGQUERY,
    LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_SNOWFLAKE,
    LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT,
    LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT_ARRAY,
    LIGHTDASH_TABLE_WITH_GROUP_BLOCK,
    LIGHTDASH_TABLE_WITH_GROUP_LABEL,
    LIGHTDASH_TABLE_WITH_METRIC_AI_HINT,
    LIGHTDASH_TABLE_WITH_METRIC_AI_HINT_ARRAY,
    LIGHTDASH_TABLE_WITH_METRIC_LEVEL_CATEGORIES,
    LIGHTDASH_TABLE_WITH_METRICS,
    LIGHTDASH_TABLE_WITH_MODEL_LEVEL_CATEGORIES,
    LIGHTDASH_TABLE_WITH_MODEL_METRIC_AI_HINT,
    LIGHTDASH_TABLE_WITH_NO_CATEGORIES,
    LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS,
    LIGHTDASH_TABLE_WITH_SINGLE_PRIMARY_KEY,
    LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS,
    model,
    MODEL_WITH_ADDITIONAL_DIMENSIONS,
    MODEL_WITH_AI_HINT,
    MODEL_WITH_AI_HINT_ARRAY,
    MODEL_WITH_AI_HINT_IN_CONFIG,
    MODEL_WITH_COMPOSITE_PRIMARY_KEY,
    MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
    MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_DIMENSION_AI_HINT,
    MODEL_WITH_DIMENSION_AI_HINT_ARRAY,
    MODEL_WITH_GROUP_LABEL,
    MODEL_WITH_GROUPS_BLOCK,
    MODEL_WITH_METRIC,
    MODEL_WITH_METRIC_AI_HINT,
    MODEL_WITH_METRIC_AI_HINT_ARRAY,
    MODEL_WITH_METRIC_DRIVERS,
    MODEL_WITH_METRIC_LEVEL_CATEGORIES,
    MODEL_WITH_MODEL_LEVEL_CATEGORIES,
    MODEL_WITH_MODEL_METRIC_AI_HINT,
    MODEL_WITH_NO_CATEGORIES,
    MODEL_WITH_NO_METRICS,
    MODEL_WITH_NO_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_OFF_BOOLEAN_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_SINGLE_PRIMARY_KEY,
    MODEL_WITH_SQL_FILTER,
    MODEL_WITH_SQL_WHERE,
    MODEL_WITH_WRONG_METRIC,
    MODEL_WITH_WRONG_METRICS,
    SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE,
    warehouseSchema,
    warehouseSchemaWithMissingColumn,
    warehouseSchemaWithMissingTable,
    warehouseSchemaWithUpperCaseColumn,
} from './translator.mock';

describe('attachTypesToModels', () => {
    it('should return models with types', async () => {
        expect(attachTypesToModels([model], warehouseSchema, false)[0]).toEqual(
            expectedModelWithType,
        );
    });
    it('should return models with undefined type when is missing dataset or table or column', async () => {
        expect(attachTypesToModels([model], {}, false)[0]).toEqual(model);
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingTable,
                false,
            )[0],
        ).toEqual(model);
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingColumn,
                false,
            )[0],
        ).toEqual(model);
    });
    it('should throw when is missing dataset or table or column', async () => {
        expect(() => attachTypesToModels([model], {}, true)).toThrowError(
            'Model "myTable" was expected in your target warehouse at "myDatabase.mySchema.myTable". Does the table exist in your target data warehouse?',
        );
        expect(() =>
            attachTypesToModels([model], warehouseSchemaWithMissingTable, true),
        ).toThrowError(
            'Model "myTable" was expected in your target warehouse at "myDatabase.mySchema.myTable". Does the table exist in your target data warehouse?',
        );
        expect(() =>
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingColumn,
                true,
            ),
        ).toThrowError(
            'Column "myColumnName" from model "myTable" does not exist.\n "myTable.myColumnName" was not found in your target warehouse at myDatabase.mySchema.myTable. Try rerunning dbt to update your warehouse.',
        );
    });
    it('should throw an error when column has wrong case', async () => {
        expect(() =>
            attachTypesToModels(
                [model],
                warehouseSchemaWithUpperCaseColumn,
                true,
            ),
        ).toThrowError(
            'Column "myColumnName" from model "myTable" does not exist.\n "myTable.myColumnName" was not found in your target warehouse at myDatabase.mySchema.myTable. Try rerunning dbt to update your warehouse.',
        );
    });
    it('should match uppercase column names when case-sensitive is false', async () => {
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithUpperCaseColumn,
                true,
                false,
            )[0],
        ).toEqual(expectedModelWithType);
    });
});

describe('additional dimensions with hidden base dimension', () => {
    it('should inherit hidden from the additional dimension rather than the base', () => {
        const MODEL_WITH_HIDDEN_BASE_AND_VISIBLE_ADDITIONAL: DbtModelNode & {
            relation_name: string;
        } = {
            ...model,
            columns: {
                year_opened: {
                    name: 'year_opened',
                    description: 'Year the order was placed',
                    data_type: DimensionType.NUMBER,
                    meta: {
                        dimension: {
                            type: DimensionType.NUMBER,
                            hidden: true,
                        },
                        additional_dimensions: {
                            year_opened_date: {
                                hidden: false,
                                type: DimensionType.DATE,
                                label: 'Year opened',
                                sql: "cast(${year_opened} || '-01-01' as date)",
                                time_intervals: [
                                    TimeFrames.YEAR,
                                    TimeFrames.YEAR_NUM,
                                ],
                            },
                        },
                    },
                },
            },
        };

        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_HIDDEN_BASE_AND_VISIBLE_ADDITIONAL,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        // Base dimension should be hidden
        expect(result.dimensions.year_opened.hidden).toBe(true);

        // Additional dimension base should NOT be hidden
        expect(result.dimensions.year_opened_date.hidden).toBe(false);
        expect(result.dimensions.year_opened_date.isAdditionalDimension).toBe(
            true,
        );
        expect(result.dimensions.year_opened_date.isIntervalBase).toBe(true);

        // Time interval dimensions should NOT be hidden (they should inherit from the additional dimension, not the base)
        expect(result.dimensions.year_opened_date_year.hidden).toBe(false);
        expect(result.dimensions.year_opened_date_year.timeInterval).toBe(
            TimeFrames.YEAR,
        );

        expect(result.dimensions.year_opened_date_year_num.hidden).toBe(false);
        expect(result.dimensions.year_opened_date_year_num.timeInterval).toBe(
            TimeFrames.YEAR_NUM,
        );
    });
});

describe('additional dimensions in dbt 1.10+ (config.meta structure)', () => {
    // In dbt 1.10+, metadata is stored in config.meta instead of meta
    // This test verifies that interval dimensions of additional dimensions
    // properly use the additional dimension's properties (label, sql, etc.)
    // instead of being overwritten by the base dimension's properties
    it('should preserve additional dimension labels when metadata is in config.meta', () => {
        const MODEL_WITH_CONFIG_META_ADDITIONAL_DIMENSIONS: DbtModelNode & {
            relation_name: string;
        } = {
            ...model,
            columns: {
                order_date: {
                    name: 'order_date',
                    data_type: DimensionType.TIMESTAMP,
                    // dbt 1.10+ structure: metadata in config.meta instead of meta
                    config: {
                        meta: {
                            dimension: {
                                type: DimensionType.TIMESTAMP,
                                label: 'Order Date (UTC)',
                            },
                            additional_dimensions: {
                                order_date_pt: {
                                    type: DimensionType.TIMESTAMP,
                                    label: 'Order Date (PT)',
                                    sql: "convert_timezone('UTC', 'America/Los_Angeles', ${TABLE}.order_date)",
                                    time_intervals: [
                                        TimeFrames.DAY,
                                        TimeFrames.MONTH,
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        };

        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_CONFIG_META_ADDITIONAL_DIMENSIONS,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        // Base dimension should have its own label
        expect(result.dimensions.order_date.label).toBe('Order Date (UTC)');
        expect(result.dimensions.order_date.isIntervalBase).toBe(true);

        // Additional dimension should have its own label (not the base dimension's label)
        expect(result.dimensions.order_date_pt.label).toBe('Order Date (PT)');
        expect(result.dimensions.order_date_pt.isAdditionalDimension).toBe(
            true,
        );
        expect(result.dimensions.order_date_pt.isIntervalBase).toBe(true);

        // Time interval dimensions should have the correct base name (order_date_pt, not order_date)
        expect(result.dimensions).toHaveProperty('order_date_pt_day');
        expect(result.dimensions).toHaveProperty('order_date_pt_month');

        // The interval dimension's base name should be the additional dimension, not the original column
        expect(
            result.dimensions.order_date_pt_day.timeIntervalBaseDimensionName,
        ).toBe('order_date_pt');
        expect(
            result.dimensions.order_date_pt_month.timeIntervalBaseDimensionName,
        ).toBe('order_date_pt');

        // Interval dimensions should inherit the additional dimension's label prefix, not the base dimension's
        // This is the key assertion - without the fix, these would incorrectly be "Order Date (UTC) Day" etc.
        expect(result.dimensions.order_date_pt_day.label).toContain(
            'Order Date (PT)',
        );
        expect(result.dimensions.order_date_pt_month.label).toContain(
            'Order Date (PT)',
        );
    });
});

describe('convert tables from dbt models', () => {
    it('should convert dbt model without metrics to Lightdash table without autogenerated metrics', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_METRICS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS);
    });
    it('should convert dbt model with dbt metrics', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_METRICS,
                [
                    DBT_METRIC,
                    DBT_METRIC_WITH_SQL_FIELD,
                    DBT_METRIC_WITH_CUSTOM_SQL,
                    DBT_METRIC_WITH_FILTER,
                    DBT_METRIC_DERIVED,
                ],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DBT_METRICS);
        // dbt 1.5 metrics
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_METRICS,
                [DBT_V9_METRIC],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DBT_V9_METRICS);
    });
    it('should convert dbt model with metrics in meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRICS);
    });
    it('should convert dbt model with metrics that have drivers', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_METRIC_DRIVERS,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        // Metric without drivers should not have the property
        expect(result.metrics.user_count.drivers).toBeUndefined();

        // Metric with drivers should have them parsed correctly
        expect(result.metrics.total_num_participating_athletes.drivers).toEqual(
            ['user_count', 'other_table.other_metric'],
        );
    });
    it('should convert dbt model with dimension with default time intervals bigquery', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(
            LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_BIGQUERY,
        );
    });
    it('should convert dbt model with dimension with no time intervals bigquery', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(
            LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_BIGQUERY,
        );
    });
    it('should convert dbt model with dimension with default time intervals snowflake', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.SNOWFLAKE,
                MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(
            LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_SNOWFLAKE,
        );
    });
    it('should convert dbt model with dimension with no time intervals snowflake', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.SNOWFLAKE,
                MODEL_WITH_NO_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(
            LIGHTDASH_TABLE_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS_SNOWFLAKE,
        );
    });
    it('should convert dbt model with dimension with off time intervals', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_OFF_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS);
    });
    it('should convert dbt model with dimension with off boolean time intervals', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_OFF_BOOLEAN_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS);
    });
    it('should convert dbt model with dimension with custom time intervals', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS);
    });
    it('should throw an error when metric and dimension have the same name', async () => {
        expect(() =>
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_WRONG_METRIC,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toThrowError(
            'Found a metric and a dimension with the same name: user_id',
        );
    });
    it('should throw an error when multiple metrics and dimensions have the same name', async () => {
        expect(() =>
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_WRONG_METRICS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toThrowError(
            'Found multiple metrics and a dimensions with the same name: user_id,user_id2',
        );
    });

    it('should convert dbt model with group label', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_GROUP_LABEL,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_GROUP_LABEL);
    });

    // `sql_where` is an alias of `sql_filter`
    it('should convert dbt model with sql where', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_SQL_WHERE,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_SQL_WHERE);
    });

    it('should convert dbt model with sql filter', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_SQL_FILTER,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_SQL_WHERE);
    });

    it('should convert dbt model with dimension and additional dimensions', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.POSTGRES,
                MODEL_WITH_ADDITIONAL_DIMENSIONS,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_ADDITIONAL_DIMENSIONS);
    });

    it('should convert dbt model with groups meta block', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_GROUPS_BLOCK,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_GROUP_BLOCK);
    });

    it('should convert dbt model with single column primary key', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_SINGLE_PRIMARY_KEY,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_SINGLE_PRIMARY_KEY);
    });

    it('should convert dbt model with composite primary key', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_COMPOSITE_PRIMARY_KEY,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_COMPOSITE_PRIMARY_KEY);
    });

    it('should convert dbt model with dimension ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_DIMENSION_AI_HINT,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT);
    });

    it('should convert dbt model with metric ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_AI_HINT,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRIC_AI_HINT);
    });

    it('should convert dbt model with model-level metric ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_MODEL_METRIC_AI_HINT,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_MODEL_METRIC_AI_HINT);
    });

    it('should convert dbt model with table ai.hint in meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT);
    });

    it('should convert dbt model with table ai.hint in config.meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT_IN_CONFIG,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT_FROM_CONFIG);
    });

    it('should convert dbt model with table ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT_ARRAY,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT_ARRAY);
    });

    it('should convert dbt model with dimension ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_DIMENSION_AI_HINT_ARRAY,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT_ARRAY);
    });

    it('should convert dbt model with metric ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_AI_HINT_ARRAY,
                [],
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRIC_AI_HINT_ARRAY);
    });

    describe('with set fields', () => {
        it('returns table with valid set fields', () => {
            expect(
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                my_set: {
                                    fields: ['user_id'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toBeTruthy();
        });

        it('throws when set name conflicts with dimension name', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                user_id: {
                                    fields: ['user_id'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set name "user_id" in model "myTable" conflicts with an existing field name. Set names must be unique from dimension and metric names.`,
            );
        });

        it('throws when set name conflicts with metric name', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_METRIC,
                        meta: {
                            ...MODEL_WITH_METRIC.meta,
                            sets: {
                                user_count: {
                                    fields: ['user_id'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set name "user_count" in model "myTable" conflicts with an existing field name. Set names must be unique from dimension and metric names.`,
            );
        });

        it('throws when set definition is missing fields array', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                // @ts-expect-error - intentionally testing invalid type
                                my_set: {},
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "my_set" in model "myTable" must have a "fields" array`,
            );
        });

        it('throws when set fields array is empty', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                my_set: {
                                    fields: [],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(`Set "my_set" in model "myTable" cannot be empty`);
        });

        it('throws when set contains non-string field', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                my_set: {
                                    // @ts-expect-error - intentionally testing invalid type
                                    fields: [123],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "my_set" in model "myTable" contains non-string field: 123`,
            );
        });

        it('allows set references up to 3 levels', () => {
            expect(
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                level1: {
                                    fields: ['user_id'],
                                },
                                level2: {
                                    fields: ['level1*'],
                                },
                                level3: {
                                    fields: ['level2*'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toBeTruthy();
        });

        it('throws when set has nested set references beyond 3 levels', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                level1: {
                                    fields: ['user_id'],
                                },
                                level2: {
                                    fields: ['level1*'],
                                },
                                level3: {
                                    fields: ['level2*'],
                                },
                                level4: {
                                    fields: ['level3*'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "level4" in model "myTable" exceeds the maximum nesting level of 3.`,
            );
        });

        it('allows valid set references with wildcard', () => {
            expect(
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            sets: {
                                base_set: {
                                    fields: ['user_id'],
                                },
                                extended_set: {
                                    fields: ['base_set*'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toBeTruthy();
        });

        it('allows valid field exclusions with minus prefix', () => {
            expect(
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            joins: [
                                {
                                    join: 'a_table',
                                    sql_on: '${myTable.id} = ${a_table.id}',
                                },
                                {
                                    join: 'a_table',
                                    alias: 'another_table',
                                    sql_on: '${myTable.id} = ${another_table.id}',
                                },
                            ],
                            sets: {
                                my_set: {
                                    fields: [
                                        'user_id',
                                        '-user_id',
                                        'a_table.user_name',
                                        'another_table.user_id',
                                    ],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toBeTruthy();
        });

        it('allows valid field names with joins', () => {
            expect(
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_NO_METRICS,
                        meta: {
                            joins: [
                                {
                                    join: 'a_table',
                                    alias: 'user',
                                    sql_on: '${myTable.id} = ${a_table.id}',
                                },
                            ],
                            sets: {
                                my_set: {
                                    fields: ['user.id'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toBeTruthy();
        });

        it('throws when set references non-existent field', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_METRIC,
                        meta: {
                            joins: [
                                {
                                    join: 'a_table',
                                    sql_on: '${myTable.id} = ${a_table.id}',
                                },
                            ],
                            sets: {
                                my_bad_set: {
                                    fields: ['bogus_field'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "my_bad_set" in model "myTable" references non-existent model field "bogus_field". Fields must correspond to actual dimensions or metrics in the model.`,
            );
        });

        it('throws when set references non-existent join model', () => {
            expect(() =>
                convertTable(
                    SupportedDbtAdapter.BIGQUERY,
                    {
                        ...MODEL_WITH_METRIC,
                        meta: {
                            joins: [
                                {
                                    join: 'a_table',
                                    sql_on: '${myTable.id} = ${a_table.id}',
                                },
                            ],
                            sets: {
                                my_bad_set: {
                                    fields: ['wat.bogus_field'],
                                },
                            },
                        },
                    },
                    [],
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "my_bad_set" in model "myTable" references non-existent join model "wat".`,
            );
        });
    });
});

describe('spotlight config', () => {
    it('should convert dbt model with metrics when no categories are defined', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_CATEGORIES,
                [DBT_METRIC],
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_NO_CATEGORIES);
    });

    it('should convert dbt model with metrics when categories are defined', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_MODEL_LEVEL_CATEGORIES,
                [DBT_METRIC],
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_MODEL_LEVEL_CATEGORIES);
    });

    it('should convert dbt model with metrics when categories are defined and there is metric level assignment', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_LEVEL_CATEGORIES,
                [DBT_METRIC],
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRIC_LEVEL_CATEGORIES);
    });

    it('should error when categories are assigned but not defined in the spotlight config', () => {
        expect(() =>
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_LEVEL_CATEGORIES,
                [DBT_METRIC],
                DEFAULT_SPOTLIGHT_CONFIG, // no categories defined
            ),
        ).toThrowError(
            `Invalid spotlight categories found in metric 'user_count': category_1, category_2. Categories must be defined in project config.`,
        );
    });
});

describe('explore-scoped additional dimensions', () => {
    const MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS: DbtModelNode & {
        relation_name: string;
    } = {
        unique_id: 'model.test.test_model',
        resource_type: 'model',
        name: 'test_model',
        database: 'testDatabase',
        schema: 'testSchema',
        alias: 'test_model',
        description: 'Test model with explore-scoped dimensions',
        relation_name: 'testDatabase.testSchema.test_model',
        columns: {
            order_id: {
                name: 'order_id',
                data_type: DimensionType.STRING,
                meta: {},
            },
            amount: {
                name: 'amount',
                data_type: DimensionType.NUMBER,
                meta: {},
            },
        },
        meta: {
            explores: {
                orders_with_custom_dims: {
                    label: 'Orders with Custom Dimensions',
                    additional_dimensions: {
                        amount_doubled: {
                            type: DimensionType.NUMBER,
                            sql: '${amount} * 2',
                            label: 'Amount Doubled',
                            description: 'The order amount multiplied by 2',
                        },
                        amount_category: {
                            type: DimensionType.STRING,
                            sql: "CASE WHEN ${amount} > 100 THEN 'high' ELSE 'low' END",
                            label: 'Amount Category',
                        },
                    },
                },
            },
        },
        config: {
            materialized: 'table',
        },
        tags: [],
        path: 'models/test_model.sql',
        patch_path: 'test://models/test_model.yml',
        depends_on: { nodes: [], macros: [] },
        refs: [],
        sources: [],
        compiled: true,
        compiled_code: 'SELECT * FROM orders',
        fqn: ['test', 'test_model'],
        raw_code: 'SELECT * FROM orders',
        language: 'sql',
        package_name: 'test',
        original_file_path: 'models/test_model.sql',
        checksum: { name: 'sha256', checksum: '' },
    };

    it('should create explore with explore-scoped additional dimensions', async () => {
        const explores = await convertExplores(
            [MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        // Should create 2 explores: base explore + additional explore with custom dimensions
        expect(explores).toHaveLength(2);

        // Find the explore with custom dimensions
        const exploreWithDims = explores.find(
            (e) => 'name' in e && e.name === 'orders_with_custom_dims',
        ) as Explore;

        expect(exploreWithDims).toBeDefined();
        expect(exploreWithDims.label).toBe('Orders with Custom Dimensions');

        // Check that explore-scoped dimensions are present
        const baseTable = exploreWithDims.tables.test_model;
        expect(baseTable.dimensions).toHaveProperty('amount_doubled');
        expect(baseTable.dimensions).toHaveProperty('amount_category');

        // Verify dimension properties
        const amountDoubled = baseTable.dimensions.amount_doubled;
        expect(amountDoubled.type).toBe(DimensionType.NUMBER);
        expect(amountDoubled.label).toBe('Amount Doubled');
        expect(amountDoubled.description).toBe(
            'The order amount multiplied by 2',
        );
        expect(amountDoubled.isAdditionalDimension).toBe(true);
        expect(amountDoubled.table).toBe('test_model');
        expect(amountDoubled.fieldType).toBe(FieldType.DIMENSION);

        const amountCategory = baseTable.dimensions.amount_category;
        expect(amountCategory.type).toBe(DimensionType.STRING);
        expect(amountCategory.label).toBe('Amount Category');
        expect(amountCategory.isAdditionalDimension).toBe(true);
    });

    it('should NOT include explore-scoped dimensions in base explore', async () => {
        const explores = await convertExplores(
            [MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        // Find the base explore
        const baseExplore = explores.find(
            (e) => 'name' in e && e.name === 'test_model',
        ) as Explore;

        expect(baseExplore).toBeDefined();

        // Base explore should NOT have the explore-scoped dimensions
        const baseTable = baseExplore.tables.test_model;
        expect(baseTable.dimensions).not.toHaveProperty('amount_doubled');
        expect(baseTable.dimensions).not.toHaveProperty('amount_category');

        // But should have the regular dimensions
        expect(baseTable.dimensions).toHaveProperty('order_id');
        expect(baseTable.dimensions).toHaveProperty('amount');
    });

    const MODEL_WITH_DATE_EXPLORE_DIMENSION: DbtModelNode = {
        ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
        meta: {
            explores: {
                orders_with_date_dims: {
                    label: 'Orders with Date Dimensions',
                    additional_dimensions: {
                        custom_date: {
                            type: DimensionType.DATE,
                            sql: 'DATE(${amount})',
                            label: 'Custom Date',
                            time_intervals: [
                                TimeFrames.DAY,
                                TimeFrames.WEEK,
                                TimeFrames.MONTH,
                            ],
                        },
                    },
                },
            },
        },
    };

    it('should create time interval dimensions for date type explore-scoped dimensions', async () => {
        const explores = await convertExplores(
            [MODEL_WITH_DATE_EXPLORE_DIMENSION],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        const exploreWithDims = explores.find(
            (e) => 'name' in e && e.name === 'orders_with_date_dims',
        ) as Explore;

        expect(exploreWithDims).toBeDefined();

        const baseTable = exploreWithDims.tables.test_model;

        // Should have the base date dimension
        expect(baseTable.dimensions).toHaveProperty('custom_date');
        expect(baseTable.dimensions.custom_date.type).toBe(DimensionType.DATE);
        expect(baseTable.dimensions.custom_date.isIntervalBase).toBe(true);

        // Should have time interval dimensions
        expect(baseTable.dimensions).toHaveProperty('custom_date_day');
        expect(baseTable.dimensions).toHaveProperty('custom_date_week');
        expect(baseTable.dimensions).toHaveProperty('custom_date_month');

        // Verify time interval dimension properties
        expect(baseTable.dimensions.custom_date_day.timeInterval).toBe('DAY');
        expect(
            baseTable.dimensions.custom_date_day.timeIntervalBaseDimensionName,
        ).toBe('custom_date');
    });

    it('should apply default show underlying values to metrics', () => {
        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table).toMatchObject(
            LIGHTDASH_TABLE_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
        );

        // Verify the metric without explicit show_underlying_values uses the default
        expect(table.metrics.total_revenue.showUnderlyingValues).toEqual([
            'user_id',
            'user_name',
        ]);

        // Verify the metric with explicit show_underlying_values overrides the default
        expect(table.metrics.average_revenue.showUnderlyingValues).toEqual([
            'custom_field',
        ]);
    });
});
