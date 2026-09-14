import {
    SupportedDbtAdapter,
    type DbtModelLightdashConfig,
    type DbtModelNode,
    type RESERVED_MODEL_META_KEYS,
} from '../types/dbt';
import {
    getExploreSplitCandidates,
    InlineErrorType,
    isExploreError,
    JoinRelationship,
    type Explore,
} from '../types/explore';
import {
    DimensionType,
    FieldType,
    MetricType,
    NumberSeparator,
} from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { TimeFrames } from '../types/timeFrames';
import {
    setCatalogNestedColumnShape,
    WAREHOUSE_TIMESTAMP_DOMAINS_KEY,
    type WarehouseCatalog,
} from '../types/warehouse';
import { ExploreCompiler } from './exploreCompiler';
import { warehouseClientMock } from './exploreCompiler.mock';
import { getExploreParameterDefinitions } from './parameters';
import {
    attachTypesToModels,
    convertExplores,
    convertTable,
    iterateExplores,
    type AttachTypesDiagnostics,
} from './translator';
import {
    expectedModelWithTimestampDomain,
    expectedModelWithType,
    LIGHTDASH_TABLE_SQL_WHERE,
    LIGHTDASH_TABLE_WITH_ADDITIONAL_DIMENSIONS,
    LIGHTDASH_TABLE_WITH_AI_HINT,
    LIGHTDASH_TABLE_WITH_AI_HINT_ARRAY,
    LIGHTDASH_TABLE_WITH_AI_HINT_FROM_CONFIG,
    LIGHTDASH_TABLE_WITH_COMPOSITE_PRIMARY_KEY,
    LIGHTDASH_TABLE_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
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
    MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
    MODEL_WITH_COMPOSITE_PRIMARY_KEY,
    MODEL_WITH_CUSTOM_GRANULARITY,
    MODEL_WITH_CUSTOM_GRANULARITY_AND_REQUIRED_ATTRIBUTES,
    MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
    MODEL_WITH_DEFAULT_TIME_INTERVAL_DIMENSIONS,
    MODEL_WITH_DIMENSION_AI_HINT,
    MODEL_WITH_DIMENSION_AI_HINT_ARRAY,
    MODEL_WITH_DUPLICATE_METRIC_DIMENSION_NAME,
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
    MODEL_WITH_SQLLESS_ADDITIONAL_DIMENSION,
    MODEL_WITH_TIMESTAMP_DOMAIN,
    MODEL_WITH_TIMESTAMP_DOMAIN_ADDITIONAL_DIMENSION,
    MODEL_WITH_TIMESTAMP_DOMAIN_CUSTOM_SQL,
    MODEL_WITH_TIMESTAMP_DOMAIN_CUSTOM_SQL_ANNOTATED,
    MODEL_WITH_TIMESTAMP_DOMAIN_YAML_OVERRIDE,
    MODEL_WITH_UNKNOWN_TIMESTAMP_DOMAIN,
    MODEL_WITH_WRONG_METRIC,
    MODEL_WITH_WRONG_METRICS,
    SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE,
    warehouseSchema,
    warehouseSchemaWithAllUpperCaseKeys,
    warehouseSchemaWithEmptyStringDatabase,
    warehouseSchemaWithMissingColumn,
    warehouseSchemaWithMissingTable,
    warehouseSchemaWithTimestampDomain,
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
    it('should match an empty-string database key (ClickHouse table_catalog)', async () => {
        const emptyDbModel = { ...model, database: '' };
        expect(() =>
            attachTypesToModels(
                [emptyDbModel],
                warehouseSchemaWithEmptyStringDatabase,
                true,
            ),
        ).not.toThrow();
        expect(
            attachTypesToModels(
                [emptyDbModel],
                warehouseSchemaWithEmptyStringDatabase,
                false,
            )[0].columns.myColumnName.data_type,
        ).toEqual(DimensionType.STRING);
    });
    it('should match uppercase catalog keys at every level when case-insensitive (Snowflake)', async () => {
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithAllUpperCaseKeys,
                true,
                false,
            )[0],
        ).toEqual(expectedModelWithType);
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
    it('should keep the first catalog entry when two fold to the same name', async () => {
        // Neither key matches exactly, so both can only be reached case-insensitively.
        const collidingCatalog: WarehouseCatalog = {
            myDatabase: {
                mySchema: {
                    MYTABLE: { myColumnName: DimensionType.NUMBER },
                    MyTable: { myColumnName: DimensionType.STRING },
                },
            },
        };
        expect(
            attachTypesToModels([model], collidingCatalog, true, false)[0]
                .columns.myColumnName.data_type,
        ).toEqual(DimensionType.NUMBER);
    });
    it('should prefer an exact match over a case-insensitive one', async () => {
        const collidingCatalog: WarehouseCatalog = {
            myDatabase: {
                mySchema: {
                    MYTABLE: { myColumnName: DimensionType.NUMBER },
                    myTable: { myColumnName: DimensionType.STRING },
                },
            },
        };
        expect(
            attachTypesToModels([model], collidingCatalog, true, false)[0]
                .columns.myColumnName.data_type,
        ).toEqual(DimensionType.STRING);
    });
    it('should not treat the timestamp-domain sidecar as a database', async () => {
        const catalogWithSidecar = {
            ...warehouseSchema,
            [WAREHOUSE_TIMESTAMP_DOMAINS_KEY]: {
                myDatabase: {
                    mySchema: { myTable: { myColumnName: 'utc' } },
                },
            },
        } as unknown as WarehouseCatalog;
        const diagnostics: AttachTypesDiagnostics[] = [];
        expect(() =>
            attachTypesToModels([model], catalogWithSidecar, true, true, (d) =>
                diagnostics.push(d),
            ),
        ).not.toThrow();
        expect(diagnostics[0].catalogTableCount).toEqual(1);
    });
    it('should count an exact table with a case-insensitive column as case-insensitive', async () => {
        // The table key matches exactly and only the column needs folding. This is the
        // combination that a table-level-only classification gets wrong.
        const diagnostics: AttachTypesDiagnostics[] = [];
        attachTypesToModels(
            [model],
            warehouseSchemaWithUpperCaseColumn,
            true,
            false,
            (d) => diagnostics.push(d),
        );
        expect(diagnostics[0].caseInsensitiveLookups).toEqual(1);
        expect(diagnostics[0].exactLookups).toEqual(0);
    });
    it('should count a case-insensitive table as case-insensitive', async () => {
        const diagnostics: AttachTypesDiagnostics[] = [];
        attachTypesToModels(
            [model],
            warehouseSchemaWithAllUpperCaseKeys,
            true,
            false,
            (d) => diagnostics.push(d),
        );
        expect(diagnostics[0].caseInsensitiveLookups).toEqual(1);
        expect(diagnostics[0].exactLookups).toEqual(0);
    });
    it('should report diagnostics for the phase', async () => {
        const diagnostics: AttachTypesDiagnostics[] = [];
        attachTypesToModels([model], warehouseSchema, false, true, (d) =>
            diagnostics.push(d),
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].modelCount).toEqual(1);
        expect(diagnostics[0].columnCount).toEqual(
            Object.keys(model.columns).length,
        );
        expect(diagnostics[0].catalogTableCount).toEqual(1);
        expect(diagnostics[0].exactLookups).toEqual(1);
        expect(diagnostics[0].caseInsensitiveLookups).toEqual(0);
        expect(diagnostics[0].schemaPairs).toEqual([
            { databaseSchema: 'myDatabase.mySchema', models: 1 },
        ]);
    });
});

describe('timestamp domain', () => {
    const customGranularities = {
        slt_week: {
            label: 'SLT Week',
            sql: "DATE_TRUNC('week', ${COLUMN})",
            type: DimensionType.TIMESTAMP,
        },
    } as const;

    it('should attach timestamp_domain as a sibling of data_type', () => {
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithTimestampDomain,
                false,
            )[0],
        ).toEqual(expectedModelWithTimestampDomain);
    });

    it('should not attach timestamp_domain for legacy catalog entries', () => {
        expect(
            attachTypesToModels([model], warehouseSchema, false)[0].columns
                .myColumnName,
        ).not.toHaveProperty('timestamp_domain');
    });

    it('should stamp timestampDomain on standard intervals but not custom granularities', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_TIMESTAMP_DOMAIN,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            customGranularities,
        );

        expect(result.dimensions.user_created.timestampDomain).toEqual('naive');
        expect(result.dimensions.user_created_raw.timestampDomain).toEqual(
            'naive',
        );
        expect(result.dimensions.user_created_day.timestampDomain).toEqual(
            'naive',
        );
        expect(result.dimensions.user_created_slt_week).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should prefer the YAML timestamp_domain over the catalog', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_TIMESTAMP_DOMAIN_YAML_OVERRIDE,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created.timestampDomain).toEqual('aware');
        expect(result.dimensions.user_created_day.timestampDomain).toEqual(
            'aware',
        );
    });

    it('should leave timestampDomain absent when unknown', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_UNKNOWN_TIMESTAMP_DOMAIN,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created).not.toHaveProperty(
            'timestampDomain',
        );
        expect(result.dimensions.user_created_day).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should not stamp the catalog domain on a custom SQL dimension', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_TIMESTAMP_DOMAIN_CUSTOM_SQL,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created).not.toHaveProperty(
            'timestampDomain',
        );
        expect(result.dimensions.user_created_day).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should honour the YAML timestamp_domain on a custom SQL dimension', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_TIMESTAMP_DOMAIN_CUSTOM_SQL_ANNOTATED,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created.timestampDomain).toEqual('naive');
        expect(result.dimensions.user_created_day.timestampDomain).toEqual(
            'naive',
        );
    });

    it('should not stamp the catalog domain on additional dimensions', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_TIMESTAMP_DOMAIN_ADDITIONAL_DIMENSION,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created.timestampDomain).toEqual('naive');
        expect(result.dimensions.user_created_shifted).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should not stamp the catalog domain on a sql-less additional dimension', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_SQLLESS_ADDITIONAL_DIMENSION,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created.timestampDomain).toEqual('naive');
        expect(result.dimensions.user_created_copy).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should carry an additional dimension timestamp_domain to its interval children and not leak the base annotation', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        // Base column YAML annotation applies to itself and its children
        expect(result.dimensions.user_created.timestampDomain).toEqual('naive');
        expect(result.dimensions.user_created_day.timestampDomain).toEqual(
            'naive',
        );
        // Annotated additional dim: its own domain reaches its children
        expect(result.dimensions.user_created_aware.timestampDomain).toEqual(
            'aware',
        );
        expect(
            result.dimensions.user_created_aware_day.timestampDomain,
        ).toEqual('aware');
        // Unannotated additional dim: neither the base annotation nor the
        // catalog leaks onto it or its children
        expect(result.dimensions.user_created_plain).not.toHaveProperty(
            'timestampDomain',
        );
        expect(result.dimensions.user_created_plain_day).not.toHaveProperty(
            'timestampDomain',
        );
    });

    it('should apply the Snowflake timestamp conversion once on additional dimension interval children', () => {
        const result = convertTable(
            SupportedDbtAdapter.SNOWFLAKE,
            MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.user_created_plain.sql).toEqual(
            "TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created_other))",
        );
        expect(result.dimensions.user_created_plain_day.sql).toEqual(
            "DATE_TRUNC('DAY', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created_other)))",
        );
        expect(result.dimensions.user_created_aware_day.sql).toEqual(
            "DATE_TRUNC('DAY', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created_utc)))",
        );
        // Regular column children are derived from the raw column meta
        expect(result.dimensions.user_created_day.sql).toEqual(
            "DATE_TRUNC('DAY', TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${TABLE}.user_created)))",
        );
    });

    it('should not wrap additional dimension interval children when timestamp conversion is disabled', () => {
        const result = convertTable(
            SupportedDbtAdapter.SNOWFLAKE,
            MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            true,
        );

        expect(result.dimensions.user_created_plain.sql).toEqual(
            '${TABLE}.user_created_other',
        );
        expect(result.dimensions.user_created_plain_day).toMatchObject({
            sql: "DATE_TRUNC('DAY', ${TABLE}.user_created_other)",
            timeIntervalBaseDimensionName: 'user_created_plain',
        });
    });

    it('should leave additional dimension interval children unchanged on adapters without a timestamp wrap', () => {
        const postgres = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(postgres.dimensions.user_created_plain_day.sql).toEqual(
            "DATE_TRUNC('DAY', ${TABLE}.user_created_other)",
        );

        const bigquery = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_ANNOTATED_ADDITIONAL_DIMENSIONS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(bigquery.dimensions.user_created_plain_day.sql).toEqual(
            'TIMESTAMP_TRUNC(${TABLE}.user_created_other, DAY)',
        );
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

    it('should parse the number separator from dbt meta onto dimensions and metrics', () => {
        const modelWithSeparators: DbtModelNode & {
            relation_name: string;
        } = {
            ...model,
            columns: {
                revenue: {
                    name: 'revenue',
                    data_type: DimensionType.NUMBER,
                    meta: {
                        dimension: {
                            type: DimensionType.NUMBER,
                            separator: NumberSeparator.PERIOD_COMMA,
                        },
                        metrics: {
                            total_revenue: {
                                type: MetricType.SUM,
                                separator: NumberSeparator.SPACE_PERIOD,
                            },
                        },
                    },
                },
            },
        };

        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            modelWithSeparators,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(result.dimensions.revenue.separator).toBe(
            NumberSeparator.PERIOD_COMMA,
        );
        expect(result.metrics.total_revenue.separator).toBe(
            NumberSeparator.SPACE_PERIOD,
        );
    });
});

describe('convert tables from dbt models', () => {
    it('should convert dbt model without metrics to Lightdash table without autogenerated metrics', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_METRICS,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITHOUT_AUTO_METRICS);
    });
    it('should convert dbt model with metrics in meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRICS);
    });
    it('should convert dbt model with metrics that have drivers', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_METRIC_DRIVERS,
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
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS);
    });
    it('should convert dbt model with dimension with off boolean time intervals', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_OFF_BOOLEAN_TIME_INTERVAL_DIMENSIONS,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_OFF_TIME_INTERVAL_DIMENSIONS);
    });
    it('should convert dbt model with dimension with custom time intervals', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_CUSTOM_TIME_INTERVAL_DIMENSIONS);
    });
    it('should warn and skip metric when metric and dimension have the same name', async () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_WRONG_METRIC,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: InlineErrorType.DUPLICATE_FIELD_NAME,
                    message: expect.stringContaining('user_id'),
                }),
            ]),
        );
        expect(result.dimensions).toHaveProperty('user_id');
        expect(result.metrics).not.toHaveProperty('user_id');
    });
    it('should warn and skip metrics when multiple metrics and dimensions have the same name', async () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_WRONG_METRICS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: InlineErrorType.DUPLICATE_FIELD_NAME,
                    message: expect.stringContaining('user_id'),
                }),
            ]),
        );
        expect(result.dimensions).toHaveProperty('user_id');
        expect(result.dimensions).toHaveProperty('user_id2');
        expect(result.metrics).not.toHaveProperty('user_id');
        expect(result.metrics).not.toHaveProperty('user_id2');
    });

    it('should convert dbt model with group label', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_GROUP_LABEL,
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
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_SQL_WHERE);
    });

    it('should convert dbt model with sql filter', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_SQL_FILTER,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_SQL_WHERE);
    });

    it('should convert dbt model with dimension and additional dimensions', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.POSTGRES,
                MODEL_WITH_ADDITIONAL_DIMENSIONS,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_ADDITIONAL_DIMENSIONS);
    });

    it('should convert dimension filter autocomplete config', () => {
        const table = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                columns: {
                    user_id: {
                        ...MODEL_WITH_NO_METRICS.columns.user_id,
                        meta: {
                            dimension: {
                                filter_autocomplete: {
                                    values: [
                                        {
                                            value: 'active',
                                            label: 'Active customer',
                                        },
                                        { value: 'trial' },
                                    ],
                                    fetch_from_warehouse: false,
                                },
                            },
                        },
                    },
                },
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.dimensions.user_id.filterAutocomplete).toEqual({
            values: [
                { value: 'active', label: 'Active customer' },
                { value: 'trial' },
            ],
            fetchFromWarehouse: false,
        });
    });

    it('should convert dimension filter autocomplete label_dimension', () => {
        const table = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                columns: {
                    user_id: {
                        ...MODEL_WITH_NO_METRICS.columns.user_id,
                        meta: {
                            dimension: {
                                filter_autocomplete: {
                                    label_dimension: 'user_name',
                                },
                            },
                        },
                    },
                },
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.dimensions.user_id.filterAutocomplete).toEqual({
            fetchFromWarehouse: true,
            labelDimension: 'user_name',
        });
    });

    it('should convert dimension filter autocomplete options_from_dimension', () => {
        const table = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                columns: {
                    user_id: {
                        ...MODEL_WITH_NO_METRICS.columns.user_id,
                        meta: {
                            dimension: {
                                filter_autocomplete: {
                                    options_from_dimension: {
                                        model: 'users',
                                        dimension: 'user_id',
                                        label_dimension: 'user_name',
                                    },
                                },
                            },
                        },
                    },
                },
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.dimensions.user_id.filterAutocomplete).toEqual({
            fetchFromWarehouse: true,
            optionsFromDimension: {
                model: 'users',
                dimension: 'user_id',
                labelDimension: 'user_name',
            },
        });
    });

    it('should warn when options_from_dimension is combined with fetch_from_warehouse false', () => {
        const table = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                columns: {
                    user_id: {
                        ...MODEL_WITH_NO_METRICS.columns.user_id,
                        meta: {
                            dimension: {
                                filter_autocomplete: {
                                    fetch_from_warehouse: false,
                                    values: [{ value: 'active' }],
                                    options_from_dimension: {
                                        model: 'users',
                                        dimension: 'user_id',
                                    },
                                },
                            },
                        },
                    },
                },
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.warnings).toEqual([
            {
                type: InlineErrorType.FIELD_ERROR,
                message:
                    'Dimension "user_id" in dbt model "myTable" sets both "options_from_dimension" and "fetch_from_warehouse: false". Curated values are used and "options_from_dimension" is ignored.',
            },
        ]);
    });

    it('should warn and keep the first duplicate dimension filter autocomplete value', () => {
        const table = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                columns: {
                    user_id: {
                        ...MODEL_WITH_NO_METRICS.columns.user_id,
                        meta: {
                            dimension: {
                                filter_autocomplete: {
                                    values: [
                                        {
                                            value: 'active',
                                            label: 'Active customer',
                                        },
                                        {
                                            value: 'active',
                                            label: 'Duplicate active',
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.dimensions.user_id.filterAutocomplete?.values).toEqual([
            { value: 'active', label: 'Active customer' },
        ]);
        expect(table.warnings).toEqual([
            {
                type: InlineErrorType.FIELD_ERROR,
                message:
                    'Duplicate filter autocomplete values found for dimension "user_id" in dbt model "myTable": active. Keeping the first value and ignoring duplicates.',
            },
        ]);
    });

    it('should convert dbt model with groups meta block', async () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_GROUPS_BLOCK,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_GROUP_BLOCK);
    });

    it('should convert dbt model with single column primary key', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_SINGLE_PRIMARY_KEY,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_SINGLE_PRIMARY_KEY);
    });

    it('should convert dbt model with composite primary key', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_COMPOSITE_PRIMARY_KEY,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_COMPOSITE_PRIMARY_KEY);
    });

    it('should convert dbt model with dimension ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_DIMENSION_AI_HINT,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT);
    });

    it('should convert dbt model with metric ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_AI_HINT,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRIC_AI_HINT);
    });

    it('should convert dbt model with model-level metric ai.hint', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_MODEL_METRIC_AI_HINT,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_MODEL_METRIC_AI_HINT);
    });

    it('should convert dbt model with table ai.hint in meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT);
    });

    it('should convert dbt model with table ai.hint in config.meta', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT_IN_CONFIG,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT_FROM_CONFIG);
    });

    it('should convert dbt model with table ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_AI_HINT_ARRAY,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_AI_HINT_ARRAY);
    });

    it('should convert dbt model with dimension ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_DIMENSION_AI_HINT_ARRAY,
                DEFAULT_SPOTLIGHT_CONFIG,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_DIMENSION_AI_HINT_ARRAY);
    });

    it('should convert dbt model with metric ai.hint as array', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_AI_HINT_ARRAY,
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
                    DEFAULT_SPOTLIGHT_CONFIG,
                ),
            ).toThrowError(
                `Set "my_bad_set" in model "myTable" references non-existent join model "wat".`,
            );
        });
    });
});

describe('dbt source paths', () => {
    it('omits dbtPackageName, ymlPath, and sqlPath when the model has no source paths', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_NO_METRICS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.dbtPackageName).toBeUndefined();
        expect(result.ymlPath).toBeUndefined();
        expect(result.sqlPath).toBeUndefined();
    });

    it('populates dbtPackageName, ymlPath, and sqlPath from manifest fields', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                package_name: 'jaffle_shop',
                patch_path: 'jaffle_shop://models/orders.yml',
                path: 'orders.sql',
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.dbtPackageName).toBe('jaffle_shop');
        expect(result.ymlPath).toBe('models/orders.yml');
        expect(result.sqlPath).toBe('orders.sql');
    });

    it('populates each source field independently when others are missing', () => {
        const ymlOnly = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            {
                ...MODEL_WITH_NO_METRICS,
                patch_path: 'pkg://schema.yml',
            },
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(ymlOnly.ymlPath).toBe('schema.yml');
        expect(ymlOnly.dbtPackageName).toBeUndefined();
        expect(ymlOnly.sqlPath).toBeUndefined();

        const sqlOnly = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            { ...MODEL_WITH_NO_METRICS, path: 'foo.sql' },
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(sqlOnly.sqlPath).toBe('foo.sql');
        expect(sqlOnly.ymlPath).toBeUndefined();
        expect(sqlOnly.dbtPackageName).toBeUndefined();
    });
});

describe('spotlight config', () => {
    it('should convert dbt model with metrics when no categories are defined', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_NO_CATEGORIES,
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_NO_CATEGORIES);
    });

    it('should convert dbt model with metrics when categories are defined', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_MODEL_LEVEL_CATEGORIES,
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_MODEL_LEVEL_CATEGORIES);
    });

    it('should convert dbt model with metrics when categories are defined and there is metric level assignment', () => {
        expect(
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_LEVEL_CATEGORIES,
                SPOTLIGHT_CONFIG_WITH_CATEGORIES_AND_HIDE.spotlight,
            ),
        ).toStrictEqual(LIGHTDASH_TABLE_WITH_METRIC_LEVEL_CATEGORIES);
    });

    it('should error when categories are assigned but not defined in the spotlight config', () => {
        expect(() =>
            convertTable(
                SupportedDbtAdapter.BIGQUERY,
                MODEL_WITH_METRIC_LEVEL_CATEGORIES,
                DEFAULT_SPOTLIGHT_CONFIG, // no categories defined
            ),
        ).toThrowError(
            `Invalid spotlight categories found in metric 'user_count': category_1, category_2. Categories must be defined in project config.`,
        );
    });
});

describe('merged manifest model qualification', () => {
    const buildMergedModel = ({
        sourceName,
        packageName,
        name,
        joins = [],
    }: {
        sourceName: string;
        packageName: string;
        name: string;
        joins?: DbtModelNode['meta']['joins'];
    }): DbtModelNode => ({
        ...model,
        unique_id: `model.${packageName}.${name}`,
        package_name: packageName,
        name,
        alias: name,
        relation_name: `${sourceName}.${name}`,
        lightdash_source_name: sourceName,
        columns: {
            id: {
                name: 'id',
                data_type: DimensionType.NUMBER,
                meta: {},
            },
        },
        meta: { joins },
    });

    it('qualifies every side of a cross-source collision and leaves other explores bare', async () => {
        const explores = await convertExplores(
            [
                buildMergedModel({
                    sourceName: 'analytics',
                    packageName: 'pkg_a',
                    name: 'orders',
                }),
                buildMergedModel({
                    sourceName: 'finance',
                    packageName: 'pkg_b',
                    name: 'orders',
                }),
                buildMergedModel({
                    sourceName: 'analytics',
                    packageName: 'pkg_a',
                    name: 'customers',
                }),
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        expect(explores.map(({ name }) => name).sort()).toEqual([
            'analytics__orders',
            'customers',
            'finance__orders',
        ]);
    });

    it('resolves a bare join and sql_on reference to the colliding model from the same source', async () => {
        const explores = await convertExplores(
            [
                buildMergedModel({
                    sourceName: 'analytics',
                    packageName: 'pkg_a',
                    name: 'customers',
                    joins: [
                        {
                            join: 'orders',
                            sql_on: '${customers.id} = ${orders.id}',
                        },
                    ],
                }),
                buildMergedModel({
                    sourceName: 'analytics',
                    packageName: 'pkg_a',
                    name: 'orders',
                }),
                buildMergedModel({
                    sourceName: 'finance',
                    packageName: 'pkg_b',
                    name: 'orders',
                }),
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        const customers = explores.find(
            (explore) => explore.name === 'customers',
        ) as Explore;
        expect(customers.joinedTables).toHaveLength(1);
        expect(customers.tables.orders.sqlTable).toBe('analytics.orders');
        expect(customers.joinedTables[0].compiledSqlOn).toBe(
            '("customers".id) = ("orders".id)',
        );
    });

    it('keeps qualified join parameters scoped to the authored alias', async () => {
        const subscriptionsModel = buildMergedModel({
            sourceName: 'finance',
            packageName: 'finance',
            name: 'subscriptions',
            joins: [
                {
                    join: 'customers',
                    sql_on: '${subscriptions.id} = ${customers.id}',
                },
            ],
        });
        subscriptionsModel.meta.metrics = {
            customer_metric: {
                type: MetricType.NUMBER,
                sql: '${ld.parameters.customers.customer_name}',
            },
        };

        const financeCustomersModel = buildMergedModel({
            sourceName: 'finance',
            packageName: 'finance',
            name: 'customers',
        });
        financeCustomersModel.meta.parameters = {
            customer_name: {
                label: 'Customer name',
                default: 'Alice',
            },
        };

        const explores = await convertExplores(
            [
                subscriptionsModel,
                financeCustomersModel,
                buildMergedModel({
                    sourceName: 'marketing',
                    packageName: 'marketing',
                    name: 'customers',
                }),
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { allowPartialCompilation: true },
        );

        const subscriptions = explores.find(
            (explore) => explore.name === 'subscriptions',
        ) as Explore;

        expect(
            subscriptions.tables.subscriptions.metrics.customer_metric
                .parameterReferences,
        ).toEqual(['customers.customer_name']);
        expect(subscriptions.warnings ?? []).toEqual([]);
        expect(getExploreParameterDefinitions(subscriptions)).toHaveProperty(
            'customers.customer_name',
        );
        expect(
            getExploreParameterDefinitions(subscriptions),
        ).not.toHaveProperty('finance__customers.customer_name');
    });

    it('rejects a qualified name that collides with a genuine model name', async () => {
        await expect(
            convertExplores(
                [
                    buildMergedModel({
                        sourceName: 'analytics',
                        packageName: 'pkg_a',
                        name: 'orders',
                    }),
                    buildMergedModel({
                        sourceName: 'finance',
                        packageName: 'pkg_b',
                        name: 'orders',
                    }),
                    buildMergedModel({
                        sourceName: 'warehouse',
                        packageName: 'pkg_c',
                        name: 'analytics__orders',
                    }),
                ],
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            ),
        ).rejects.toThrow(
            'Merged dbt model name "analytics__orders" is ambiguous after qualification: model "orders" from source "analytics" (model.pkg_a.orders) and model "analytics__orders" from source "warehouse" (model.pkg_c.analytics__orders). Rename the source or model before deploying.',
        );
    });
});

describe('dbt Mesh model qualification', () => {
    const buildMeshModel = ({
        packageName,
        name,
        columnName = 'id',
        joins = [],
    }: {
        packageName: string;
        name: string;
        columnName?: string;
        joins?: DbtModelNode['meta']['joins'];
    }): DbtModelNode => ({
        ...model,
        unique_id: `model.${packageName}.${name}`,
        package_name: packageName,
        name,
        alias: name,
        relation_name: `${packageName}.${name}`,
        columns: {
            [columnName]: {
                name: columnName,
                data_type: DimensionType.NUMBER,
                meta: {},
            },
        },
        meta: { joins },
    });

    it('qualifies cross-package models and keeps bare joins package-local', async () => {
        const explores = await convertExplores(
            [
                buildMeshModel({
                    packageName: 'marketing__core',
                    name: 'customers',
                    joins: [
                        {
                            join: 'orders',
                            sql_on: '${customers.id} = ${orders.marketing_id}',
                        },
                    ],
                }),
                buildMeshModel({
                    packageName: 'marketing__core',
                    name: 'orders',
                    columnName: 'marketing_id',
                }),
                buildMeshModel({
                    packageName: 'finance',
                    name: 'orders',
                    columnName: 'finance_id',
                }),
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        expect(explores.map(({ name }) => name).sort()).toEqual([
            'customers',
            'finance__orders',
            'marketing__core__orders',
        ]);

        const marketingOrders = explores.find(
            (explore) => explore.name === 'marketing__core__orders',
        ) as Explore;
        expect(
            Object.keys(
                marketingOrders.tables.marketing__core__orders.dimensions,
            ),
        ).toContain('marketing_id');
        expect(
            Object.keys(
                marketingOrders.tables.marketing__core__orders.dimensions,
            ),
        ).not.toContain('finance_id');

        expect(getExploreSplitCandidates('orders', explores)).toEqual([
            'finance__orders',
            'marketing__core__orders',
        ]);

        const customers = explores.find(
            (explore) => explore.name === 'customers',
        ) as Explore;
        expect(customers.tables.orders.sqlTable).toBe('marketing__core.orders');
        expect(customers.tables.orders.canonicalName).toBe(
            'marketing__core__orders',
        );
        expect(customers.joinedTables[0].compiledSqlOn).toBe(
            '("customers".id) = ("orders".marketing_id)',
        );
    });

    it('rejects a package-qualified name that still collides', async () => {
        await expect(
            convertExplores(
                [
                    buildMeshModel({
                        packageName: 'analytics',
                        name: 'orders',
                    }),
                    buildMeshModel({
                        packageName: 'finance',
                        name: 'orders',
                    }),
                    buildMeshModel({
                        packageName: 'warehouse',
                        name: 'analytics__orders',
                    }),
                ],
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            ),
        ).rejects.toThrow(
            'dbt Mesh model name "analytics__orders" is ambiguous after qualification: model "orders" from package "analytics" (model.analytics.orders) and model "analytics__orders" from package "warehouse" (model.warehouse.analytics__orders). Rename the package or model before deploying.',
        );
    });
});

describe('custom model metadata', () => {
    it('reserves every recognised model config key', () => {
        expectTypeOf<(typeof RESERVED_MODEL_META_KEYS)[number]>().toEqualTypeOf<
            keyof DbtModelLightdashConfig
        >();
    });

    it.each([
        {},
        {
            label: 'Orders',
            ai_hint: 'Use for orders',
            sql_filter: '1 = 1',
            sql_where: '1 = 1',
            case_sensitive: false,
            hidden: false,
            metrics: {},
            required_filters: [],
        },
        { nested: { tier: 2 }, list: [1, 'two'], absent: null },
    ])(
        'omits customMeta when meta contains no custom scalars (%j)',
        async (meta) => {
            const explores = await convertExplores(
                [{ ...model, meta: { ...meta, explores: { curated: {} } } }],
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            );

            expect(explores).toHaveLength(2);
            explores.forEach((explore) => {
                expect(explore).not.toHaveProperty('errors');
                expect(explore).not.toHaveProperty('customMeta');
            });
        },
    );

    it('inherits merged scalar metadata on base and curated explores', async () => {
        const modelMeta = {
            model_tier: 1,
            domain: 'finance',
            certified: false,
            zero: 0,
            empty: '',
        };
        const configMeta = {
            model_tier: 2,
            nested: { tier: 3 },
            list: ['a'],
            absent: null,
        };
        const explores = await convertExplores(
            [
                {
                    ...model,
                    meta: { ...modelMeta, label: 'Base model' },
                    config: {
                        ...model.config,
                        meta: {
                            ...configMeta,
                            explores: { curated: { label: 'Curated' } },
                        },
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        expect(explores.map((explore) => explore.name)).toEqual([
            model.name,
            'curated',
        ]);
        explores.forEach((explore) => {
            expect(explore).not.toHaveProperty('errors');
            expect(explore).toHaveProperty('customMeta', {
                model_tier: 2,
                domain: 'finance',
                certified: false,
                zero: 0,
                empty: '',
            });
        });
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

    it('should override model tags for additional explores', async () => {
        const modelWithExploreTags: DbtModelNode = {
            ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
            config: {
                ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS.config,
                tags: ['model_tag'],
            },
            meta: {
                explores: {
                    tagged_orders: {
                        tags: 'additional_explore_tag',
                    },
                    inherited_orders: {},
                    untagged_orders: {
                        tags: [],
                    },
                },
            },
        };

        const explores = await convertExplores(
            [modelWithExploreTags],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(
            explores.find((explore) => explore.name === 'test_model')?.tags,
        ).toEqual(['model_tag']);
        expect(
            explores.find((explore) => explore.name === 'tagged_orders')?.tags,
        ).toEqual(['additional_explore_tag']);
        expect(
            explores.find((explore) => explore.name === 'inherited_orders')
                ?.tags,
        ).toEqual(['model_tag']);
        expect(
            explores.find((explore) => explore.name === 'untagged_orders')
                ?.tags,
        ).toEqual([]);
    });

    it('should keep additional explore tags when the model defines metrics', async () => {
        const modelWithMetricsAndExploreTags: DbtModelNode = {
            ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
            config: {
                ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS.config,
                tags: ['internal'],
                meta: {
                    metrics: {
                        row_count: {
                            type: MetricType.COUNT,
                            sql: '${TABLE}.order_id',
                        },
                    },
                    explores: {
                        curated: {
                            label: 'Curated',
                            tags: ['ai'],
                        },
                    },
                },
            },
            meta: {},
        };

        const explores = await convertExplores(
            [modelWithMetricsAndExploreTags],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(
            explores.find((explore) => explore.name === 'test_model')?.tags,
        ).toEqual(['internal']);
        expect(
            explores.find((explore) => explore.name === 'curated')?.tags,
        ).toEqual(['ai']);
    });

    it('should not create a base explore when the model is hidden', async () => {
        const hiddenModel: DbtModelNode = {
            ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
            config: {
                ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS.config,
                meta: {
                    hidden: true,
                    explores: {
                        curated: {
                            label: 'Curated',
                            tags: ['ai'],
                        },
                    },
                },
            },
            meta: {},
        };

        const explores = await convertExplores(
            [hiddenModel],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(explores.map((explore) => explore.name)).toEqual(['curated']);
        // The hidden model is still the base table of the curated explore
        const curated = explores[0] as Explore;
        expect(curated.baseTable).toEqual('test_model');
        expect(Object.keys(curated.tables.test_model.dimensions)).toEqual(
            expect.arrayContaining(['order_id', 'amount']),
        );
    });

    it('should create no explores when a hidden model has no additional explores', async () => {
        const hiddenModel: DbtModelNode = {
            ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
            config: {
                ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS.config,
                meta: { hidden: true },
            },
            meta: {},
        };

        const explores = await convertExplores(
            [hiddenModel],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(explores).toEqual([]);
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

    it('should apply sql_filter from explore config', async () => {
        const modelWithExploreSqlFilter: DbtModelNode = {
            ...MODEL_WITH_EXPLORE_SCOPED_DIMENSIONS,
            meta: {
                explores: {
                    completed_orders: {
                        label: 'Completed Orders Only',
                        sql_filter: "${TABLE}.status = 'completed'",
                    },
                },
            },
        };

        const explores = await convertExplores(
            [modelWithExploreSqlFilter],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        const completedExplore = explores.find(
            (e) => 'name' in e && e.name === 'completed_orders',
        ) as Explore;

        expect(completedExplore).toBeDefined();
        expect(completedExplore.tables.test_model.sqlWhere).toBe(
            '"test_model".status = \'completed\'',
        );

        // Base explore should NOT have the sql_filter
        const baseExplore = explores.find(
            (e) => 'name' in e && e.name === 'test_model',
        ) as Explore;
        expect(baseExplore.tables.test_model.sqlWhere).toBeUndefined();
    });

    it('should apply default show underlying values to metrics', () => {
        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
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
            'user_name',
        ]);
    });

    it('should expand set refs in default_show_underlying_values on the table', () => {
        const modelWithSets = {
            ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
            meta: {
                ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES.meta,
                sets: { user_fields: { fields: ['user_id', 'user_name'] } },
                default_show_underlying_values: ['user_fields*', 'revenue'],
            },
        };

        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            modelWithSets,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.defaultShowUnderlyingValues).toEqual([
            'user_id',
            'user_name',
            'revenue',
        ]);
        expect(table.warnings).toBeUndefined();
    });

    it('should warn and drop an unknown field ref in default_show_underlying_values', () => {
        const modelWithUnknownField = {
            ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
            meta: {
                ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES.meta,
                default_show_underlying_values: ['user_id', 'user_namee'],
            },
        };

        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            modelWithUnknownField,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.defaultShowUnderlyingValues).toEqual(['user_id']);
        expect(table.warnings).toEqual([
            {
                type: InlineErrorType.SHOW_UNDERLYING_VALUES_ERROR,
                message: expect.stringContaining('user_namee'),
            },
        ]);
    });

    it('should warn and drop an unknown set ref in default_show_underlying_values', () => {
        const modelWithUnknownSet = {
            ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
            meta: {
                ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES.meta,
                default_show_underlying_values: ['nonexistent_set*', 'user_id'],
            },
        };

        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            modelWithUnknownSet,
            DEFAULT_SPOTLIGHT_CONFIG,
        );

        expect(table.defaultShowUnderlyingValues).toEqual(['user_id']);
        expect(table.warnings).toEqual([
            {
                type: InlineErrorType.SHOW_UNDERLYING_VALUES_ERROR,
                message: expect.stringContaining('nonexistent_set'),
            },
        ]);
    });
});

describe('required/default filters on hidden dimensions', () => {
    const createOrdersModel = (
        defaultFilters: Array<Record<string, unknown>>,
    ): DbtModelNode => ({
        ...model,
        name: 'orders',
        alias: 'orders',
        relation_name: 'orders',
        columns: {
            status: {
                name: 'status',
                data_type: DimensionType.STRING,
                meta: {
                    dimension: {
                        type: DimensionType.STRING,
                    },
                },
            },
            credit_card_amount: {
                name: 'credit_card_amount',
                data_type: DimensionType.NUMBER,
                meta: {
                    dimension: {
                        type: DimensionType.NUMBER,
                        hidden: true,
                    },
                    additional_dimensions: {
                        has_credit_card_payment: {
                            type: DimensionType.BOOLEAN,
                            label: 'Has credit card payment',
                            sql: '${TABLE}.credit_card_amount > 0',
                        },
                    },
                },
            },
        },
        meta: {
            default_filters:
                defaultFilters as DbtModelNode['meta']['default_filters'],
        },
    });

    it('should fail only the explore with hidden-dimension default filters and keep base explore valid', async () => {
        const modelWithExploreScopedFilters: DbtModelNode = {
            ...createOrdersModel([]),
            meta: {
                explores: {
                    orders_news_portal: {
                        label: 'Orders News Portal',
                        default_filters: [
                            {
                                credit_card_amount: '>= 0',
                                required: true,
                            },
                            {
                                has_credit_card_payment: 'true',
                                required: true,
                            },
                        ] as DbtModelNode['meta']['default_filters'],
                    },
                },
            },
        };

        const explores = await convertExplores(
            [modelWithExploreScopedFilters],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        const baseExplore = explores.find((e) => e.name === 'orders');
        const exploreWithHiddenFilterError = explores.find(
            (e) => e.name === 'orders_news_portal',
        );

        expect(baseExplore).toBeDefined();
        expect(baseExplore && 'errors' in baseExplore).toBe(false);
        expect(exploreWithHiddenFilterError).toBeDefined();
        expect(
            exploreWithHiddenFilterError &&
                'errors' in exploreWithHiddenFilterError,
        ).toBe(true);

        if (
            exploreWithHiddenFilterError &&
            'errors' in exploreWithHiddenFilterError
        ) {
            expect(exploreWithHiddenFilterError.errors[0].message).toContain(
                'credit_card_amount',
            );
            expect(exploreWithHiddenFilterError.errors[0].type).toBe(
                InlineErrorType.METADATA_PARSE_ERROR,
            );
        }
    });
});

describe('custom granularities', () => {
    const customGranularities = {
        slt_week: {
            label: 'SLT Week',
            sql: "DATE_TRUNC('week', ${COLUMN} + INTERVAL '2 days') - INTERVAL '2 days'",
        },
    };

    it('should generate dimensions for custom granularities in time_intervals', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_CUSTOM_GRANULARITY,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            customGranularities,
        );

        // Should have the custom granularity dimension
        expect(result.dimensions.created_at_slt_week).toBeDefined();
        expect(result.dimensions.created_at_slt_week.label).toBe('SLT Week');
        expect(
            result.dimensions.created_at_slt_week.timeIntervalBaseDimensionName,
        ).toBe('created_at');
        expect(result.dimensions.created_at_slt_week.sql).toContain(
            "DATE_TRUNC('week',",
        );
        expect(result.dimensions.created_at_slt_week.sql).not.toContain(
            '${COLUMN}',
        );
        expect(result.dimensions.created_at_slt_week.type).toBe(
            DimensionType.DATE,
        );
    });

    it('should also generate standard interval dimensions alongside custom ones', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_CUSTOM_GRANULARITY,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            customGranularities,
        );

        // Should have standard day dimension
        expect(result.dimensions.created_at_day).toBeDefined();
        // Should have custom slt_week dimension
        expect(result.dimensions.created_at_slt_week).toBeDefined();
    });

    it('should inherit requiredAttributes and anyAttributes from base dimension', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_CUSTOM_GRANULARITY_AND_REQUIRED_ATTRIBUTES,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            customGranularities,
        );

        expect(
            result.dimensions.created_at_slt_week.requiredAttributes,
        ).toEqual({
            department: 'finance',
        });

        // Standard interval should also have it
        expect(result.dimensions.created_at_day.requiredAttributes).toEqual({
            department: 'finance',
        });
    });

    it('should skip unknown custom granularity names without throwing', () => {
        // time_intervals has 'slt_week' but no custom granularity defined for it
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            MODEL_WITH_CUSTOM_GRANULARITY,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            {}, // empty custom granularities
        );

        // Should not have the unrecognized custom granularity dimension
        expect(result.dimensions.created_at_slt_week).toBeUndefined();
        // Should still have the standard day dimension
        expect(result.dimensions.created_at_day).toBeDefined();
    });

    it('should produce warnings for unresolved custom granularities in convertExplores', async () => {
        const result = await convertExplores(
            [MODEL_WITH_CUSTOM_GRANULARITY],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                custom_granularities: {}, // slt_week is not defined
            },
        );

        expect(result).toHaveLength(1);
        const explore = result[0];
        expect('errors' in explore).toBe(false);
        expect('warnings' in explore).toBe(true);
        if ('warnings' in explore && explore.warnings) {
            expect(explore.warnings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: InlineErrorType.FIELD_ERROR,
                        message: expect.stringContaining(
                            'Unknown time interval "slt_week"',
                        ),
                    }),
                ]),
            );
        }
    });

    it('should not produce warnings when all custom granularities are defined', async () => {
        const result = await convertExplores(
            [MODEL_WITH_CUSTOM_GRANULARITY],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                custom_granularities: customGranularities,
            },
        );

        expect(result).toHaveLength(1);
        const explore = result[0];
        expect('errors' in explore).toBe(false);
        // Should have no warnings (or empty warnings)
        if ('warnings' in explore) {
            expect(explore.warnings).toHaveLength(0);
        }
    });

    it('should only warn for unresolved custom granularities, not defined ones', async () => {
        const modelWithMixedGranularities: DbtModelNode & {
            relation_name: string;
        } = {
            ...MODEL_WITH_CUSTOM_GRANULARITY,
            columns: {
                created_at: {
                    name: 'created_at',
                    data_type: DimensionType.TIMESTAMP,
                    meta: {
                        dimension: {
                            type: DimensionType.TIMESTAMP,
                            time_intervals: ['DAY', 'slt_week', 'unknown_one'],
                        },
                    },
                },
            },
        };

        const result = await convertExplores(
            [modelWithMixedGranularities],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                custom_granularities: customGranularities, // has slt_week but not unknown_one
            },
        );

        expect(result).toHaveLength(1);
        const explore = result[0];
        expect('errors' in explore).toBe(false);
        expect('warnings' in explore).toBe(true);
        if ('warnings' in explore && explore.warnings) {
            // Only unknown_one should produce a warning
            expect(explore.warnings).toHaveLength(1);
            expect(explore.warnings[0].message).toContain('unknown_one');
            expect(explore.warnings[0].message).not.toContain('slt_week');
        }
    });
});

describe('duplicate metric/dimension names', () => {
    it('should produce a warning instead of an error when a metric and dimension share the same name', async () => {
        const result = await convertExplores(
            [MODEL_WITH_DUPLICATE_METRIC_DIMENSION_NAME],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(result).toHaveLength(1);
        const explore = result[0];
        expect('errors' in explore).toBe(false);
        expect('warnings' in explore).toBe(true);
        if ('warnings' in explore && explore.warnings) {
            expect(explore.warnings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: InlineErrorType.DUPLICATE_FIELD_NAME,
                        message: expect.stringContaining('myColumnName'),
                    }),
                ]),
            );
        }
    });

    it('should keep the dimension and remove the duplicate metric', async () => {
        const result = await convertExplores(
            [MODEL_WITH_DUPLICATE_METRIC_DIMENSION_NAME],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
        );

        expect(result).toHaveLength(1);
        const explore = result[0];
        expect('errors' in explore).toBe(false);
        if (!('errors' in explore)) {
            const table = explore.tables[explore.baseTable];
            expect(table.dimensions).toHaveProperty('myColumnName');
            expect(table.metrics).not.toHaveProperty('myColumnName');
        }
    });

    it('should preserve non-duplicate metrics alongside removed duplicates', () => {
        const modelWithMixedMetrics: DbtModelNode & {
            relation_name: string;
        } = {
            ...model,
            columns: {
                user_id: {
                    name: 'user_id',
                    data_type: DimensionType.STRING,
                    meta: {
                        metrics: {
                            user_id: { type: MetricType.COUNT_DISTINCT },
                            user_id_count: { type: MetricType.COUNT },
                        },
                    },
                },
            },
        };
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            modelWithMixedMetrics,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.dimensions).toHaveProperty('user_id');
        expect(result.metrics).not.toHaveProperty('user_id');
        expect(result.metrics).toHaveProperty('user_id_count');
        expect(result.warnings).toHaveLength(1);
    });

    it('should not break set validation when a set references a duplicate name', () => {
        const modelWithSetAndDuplicate: DbtModelNode & {
            relation_name: string;
        } = {
            ...model,
            columns: {
                user_id: {
                    name: 'user_id',
                    data_type: DimensionType.STRING,
                    meta: {
                        metrics: {
                            user_id: { type: MetricType.COUNT_DISTINCT },
                        },
                    },
                },
            },
            meta: {
                sets: {
                    my_set: {
                        fields: ['user_id'],
                    },
                },
            },
        };
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            modelWithSetAndDuplicate,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings![0]).toMatchObject({
            type: InlineErrorType.DUPLICATE_FIELD_NAME,
            message: expect.stringContaining('Skipped metric'),
        });
        expect(result.dimensions).toHaveProperty('user_id');
        expect(result.metrics).not.toHaveProperty('user_id');
    });

    it('should use singular warning message for one duplicate', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_WRONG_METRIC,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings![0].message).toMatch(
            /^Skipped metric "user_id" because a dimension with the same name exists/,
        );
    });

    it('should emit one warning per duplicate when multiple duplicates exist', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            MODEL_WITH_WRONG_METRICS,
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        const duplicateWarnings = result.warnings!.filter(
            (w) => w.type === InlineErrorType.DUPLICATE_FIELD_NAME,
        );
        expect(duplicateWarnings).toHaveLength(2);
        expect(duplicateWarnings[0].message).toContain('user_id');
        expect(duplicateWarnings[1].message).toContain('user_id2');
    });
});

describe('convert_timezone dimension override', () => {
    const buildModel = (
        convertTimezoneValue: boolean | undefined,
    ): DbtModelNode & { relation_name: string } => ({
        ...model,
        columns: {
            created_at: {
                name: 'created_at',
                description: 'when the row was created',
                data_type: DimensionType.TIMESTAMP,
                meta: {
                    dimension: {
                        type: DimensionType.TIMESTAMP,
                        ...(convertTimezoneValue !== undefined
                            ? { convert_timezone: convertTimezoneValue }
                            : {}),
                        time_intervals: [TimeFrames.DAY, TimeFrames.MONTH_NUM],
                    },
                },
            },
        },
    });

    it('writes skipTimezoneConversion: true onto the compiled dimension and its time-interval children', () => {
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            buildModel(false),
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(result.dimensions.created_at.skipTimezoneConversion).toBe(true);
        expect(result.dimensions.created_at_day.skipTimezoneConversion).toBe(
            true,
        );
        expect(
            result.dimensions.created_at_month_num.skipTimezoneConversion,
        ).toBe(true);
    });

    it('propagates skipTimezoneConversion onto custom-granularity children', () => {
        const modelWithCustom: DbtModelNode & { relation_name: string } = {
            ...model,
            columns: {
                created_at: {
                    name: 'created_at',
                    description: 'when the row was created',
                    data_type: DimensionType.TIMESTAMP,
                    meta: {
                        dimension: {
                            type: DimensionType.TIMESTAMP,
                            convert_timezone: false,
                            time_intervals: ['my_quarter'],
                        },
                    },
                },
            },
        };
        const result = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            modelWithCustom,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            {
                my_quarter: {
                    label: 'My Quarter',
                    sql: "DATE_TRUNC(${COLUMN}, 'QUARTER')",
                },
            },
        );
        expect(
            result.dimensions.created_at_my_quarter.skipTimezoneConversion,
        ).toBe(true);
    });

    it('still propagates skipTimezoneConversion when disableTimestampConversion is also set', () => {
        // The two flags are independent — both should compose.
        const result = convertTable(
            SupportedDbtAdapter.SNOWFLAKE,
            buildModel(false),
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            true,
        );
        expect(result.dimensions.created_at.skipTimezoneConversion).toBe(true);
        expect(result.dimensions.created_at_day.skipTimezoneConversion).toBe(
            true,
        );
        expect(
            result.dimensions.created_at_month_num.skipTimezoneConversion,
        ).toBe(true);
        expect(result.dimensions.created_at.sql).not.toContain(
            'CONVERT_TIMEZONE',
        );
    });

    it('omits skipTimezoneConversion when convert_timezone is unset or true (default behavior)', () => {
        const undef = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            buildModel(undefined),
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(
            undef.dimensions.created_at.skipTimezoneConversion,
        ).toBeUndefined();

        const truthy = convertTable(
            SupportedDbtAdapter.BIGQUERY,
            buildModel(true),
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(
            truthy.dimensions.created_at.skipTimezoneConversion,
        ).toBeUndefined();
    });
});

describe('project default additional_time_intervals', () => {
    const TIMESTAMP_MODEL: DbtModelNode & { relation_name: string } = {
        ...model,
        columns: {
            created_at: {
                name: 'created_at',
                data_type: DimensionType.TIMESTAMP,
                meta: { dimension: { type: DimensionType.TIMESTAMP } },
            },
        },
    };

    it('appends a standard grain (HOUR) to a timestamp column with no explicit time_intervals', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            TIMESTAMP_MODEL,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined, // startOfWeek
            undefined, // disableTimestampConversion
            undefined, // customGranularities
            undefined, // allowPartialCompilation
            { date: [], timestamp: [TimeFrames.HOUR] }, // additionalTimeIntervals
        );
        expect(result.dimensions).toHaveProperty('created_at_hour');
        expect(result.dimensions).toHaveProperty('created_at_day');
    });

    it('appends a custom granularity to a timestamp column', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            TIMESTAMP_MODEL,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            { fiscal_week: { label: 'Fiscal Week', sql: '${COLUMN}' } },
            undefined,
            { date: [], timestamp: ['fiscal_week'] },
        );
        expect(result.dimensions).toHaveProperty('created_at_fiscal_week');
    });

    it('does NOT add the project default to a column with explicit time_intervals', () => {
        const EXPLICIT_MODEL: DbtModelNode & { relation_name: string } = {
            ...model,
            columns: {
                created_at: {
                    name: 'created_at',
                    data_type: DimensionType.TIMESTAMP,
                    meta: {
                        dimension: {
                            type: DimensionType.TIMESTAMP,
                            time_intervals: [TimeFrames.DAY],
                        },
                    },
                },
            },
        };
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            EXPLICIT_MODEL,
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            undefined,
            undefined,
            { date: [], timestamp: [TimeFrames.HOUR] },
        );
        expect(result.dimensions).toHaveProperty('created_at_day');
        expect(result.dimensions).not.toHaveProperty('created_at_hour');
    });

    it('flows from convertExplores via lightdashProjectConfig.defaults', async () => {
        const explores = await convertExplores(
            [TIMESTAMP_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                defaults: {
                    additional_time_intervals: {
                        timestamp: [TimeFrames.HOUR],
                    },
                },
            },
        );
        const explore = explores[0];
        expect('errors' in explore).toBe(false);
        if (!('errors' in explore)) {
            const table = explore.tables[explore.baseTable];
            expect(table.dimensions).toHaveProperty('created_at_hour');
        }
    });
});

describe('granularity_labels overrides', () => {
    const TS_MODEL: DbtModelNode & { relation_name: string } = {
        ...model,
        columns: {
            created: {
                name: 'created',
                data_type: DimensionType.TIMESTAMP,
                meta: { dimension: { type: DimensionType.TIMESTAMP } },
            },
        },
    };

    it('bakes the override verbatim into the week dimension label + timeIntervalLabel', async () => {
        const explores = await convertExplores(
            [TS_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                defaults: {
                    granularity_labels: { week: 'Week starting Monday' },
                },
            },
        );
        const explore = explores[0];
        expect('errors' in explore).toBe(false);
        if (!('errors' in explore)) {
            const dims = explore.tables[explore.baseTable].dimensions;
            // Override is verbatim (not lowercased) in the compound label
            expect(dims.created_week.label).toContain('Week starting Monday');
            expect(dims.created_week.timeIntervalLabel).toBe(
                'Week starting Monday',
            );
            // Non-overridden grain keeps default lowercased behaviour + no timeIntervalLabel
            expect(dims.created_month.label).toContain('month');
            expect(dims.created_month.timeIntervalLabel).toBeUndefined();
            // The map is attached to the explore
            expect(explore.granularityLabels).toEqual({
                [TimeFrames.WEEK]: 'Week starting Monday',
            });
        }
    });

    it('is unchanged when no granularity_labels are configured', async () => {
        const explores = await convertExplores(
            [TS_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );
        const explore = explores[0];
        if (!('errors' in explore)) {
            const dims = explore.tables[explore.baseTable].dimensions;
            expect(dims.created_week.label).toContain('week');
            expect(dims.created_week.timeIntervalLabel).toBeUndefined();
            expect(explore.granularityLabels).toBeUndefined();
        }
    });
});

describe('iterateExplores', () => {
    const buildStreamingModel = (
        name: string,
        meta: DbtModelNode['meta'] = {},
    ): DbtModelNode => ({
        ...model,
        unique_id: `model.pkg.${name}`,
        name,
        alias: name,
        relation_name: `analytics.${name}`,
        meta,
    });

    const iterate = (models: DbtModelNode[]) =>
        iterateExplores(
            models,
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('pauses compilation until the next explore is consumed', async () => {
        const compileExplore = vi.mocked(
            vi.spyOn(ExploreCompiler.prototype, 'compileExplore'),
        );
        const iterator = iterate([
            buildStreamingModel('first'),
            buildStreamingModel('second'),
        ]);

        expect(compileExplore).not.toHaveBeenCalled();

        await iterator.next();

        expect(compileExplore).toHaveBeenCalledTimes(1);

        await Promise.resolve();

        expect(compileExplore).toHaveBeenCalledTimes(1);

        await iterator.next();

        expect(compileExplore).toHaveBeenCalledTimes(2);
    });

    it('does not compile unconsumed models after cancellation', async () => {
        const compileExplore = vi.mocked(
            vi.spyOn(ExploreCompiler.prototype, 'compileExplore'),
        );
        const iterator = iterate([
            buildStreamingModel('first'),
            buildStreamingModel('second'),
            buildStreamingModel('third'),
        ]);

        await iterator.next();
        await iterator.return(undefined);

        expect(compileExplore).toHaveBeenCalledTimes(1);
    });

    it('preserves joined, error, and extra explore output order and JSON', async () => {
        const models = [
            buildStreamingModel('orders', {
                joins: [
                    {
                        join: 'customers',
                        sql_on: '${orders.myColumnName} = ${customers.myColumnName}',
                    },
                ],
                explores: {
                    orders_extra: {},
                },
            }),
            buildStreamingModel('customers'),
            buildStreamingModel('broken', {
                joins: [
                    {
                        join: 'missing',
                        sql_on: '${broken.myColumnName} = ${missing.myColumnName}',
                    },
                ],
            }),
        ];

        const expected = await convertExplores(
            models,
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );
        const actual: Awaited<ReturnType<typeof convertExplores>> = [];
        for await (const explore of iterate(models)) {
            actual.push(explore);
        }

        expect(actual.map(({ name }) => name)).toEqual([
            'orders',
            'orders_extra',
            'customers',
            'broken',
        ]);
        expect(actual[0]).toMatchObject({
            name: 'orders',
            tables: { customers: expect.anything() },
        });
        expect(actual[3]).toMatchObject({
            name: 'broken',
            errors: expect.any(Array),
        });
        expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    });
});

describe('convertExplores at scale', () => {
    const MODEL_COUNT = 3000;

    const buildScaleModels = (
        count: number,
        withJoins: boolean,
    ): DbtModelNode[] =>
        Array.from({ length: count }, (_, index) => ({
            ...model,
            unique_id: `model.pkg.m_${index}`,
            package_name: 'pkg',
            name: `m_${index}`,
            alias: `m_${index}`,
            relation_name: `analytics.m_${index}`,
            columns: {
                id: { name: 'id', data_type: DimensionType.NUMBER, meta: {} },
                amount: {
                    name: 'amount',
                    data_type: DimensionType.NUMBER,
                    meta: {},
                },
            },
            meta:
                withJoins && index > 0
                    ? {
                          joins: [
                              {
                                  join: `m_${index - 1}`,
                                  sql_on: `\${m_${index}.id} = \${m_${index - 1}.id}`,
                              },
                          ],
                      }
                    : {},
        })) as DbtModelNode[];

    // The build this replaced. Kept as the oracle for key identity and for
    // insertion order, which JSON serialisation of an explore depends on.
    const buildTableLookupBySpread = (
        tables: { name: string }[],
    ): Record<string, { name: string }> =>
        tables.reduce(
            (prev, table) => ({ ...prev, [table.name]: table }),
            {} as Record<string, { name: string }>,
        );

    const buildTableLookupByMutation = (
        tables: { name: string }[],
    ): Record<string, { name: string }> => {
        const lookup: Record<string, { name: string }> = {};
        tables.forEach((table) => {
            lookup[table.name] = table;
        });
        return lookup;
    };

    it('builds the table lookup with the keys and the order of the spread build', () => {
        const tables = [
            { name: 'orders', version: 1 },
            { name: 'customers', version: 1 },
            { name: 'orders', version: 2 },
            { name: 'payments', version: 1 },
        ];

        const expected = buildTableLookupBySpread(tables);
        const actual = buildTableLookupByMutation(tables);

        expect(actual).toEqual(expected);
        expect(Object.keys(actual)).toEqual(Object.keys(expected));
        expect(actual.orders).toBe(tables[2]);
    });

    it.each([
        ['without joins', false],
        ['with joins', true],
    ])(
        `converts ${MODEL_COUNT} models %s in under 2 seconds`,
        async (_label, withJoins) => {
            const models = buildScaleModels(MODEL_COUNT, withJoins);

            const startedAt = performance.now();
            const explores = await convertExplores(
                models,
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            );
            const durationMs = performance.now() - startedAt;

            expect(explores).toHaveLength(MODEL_COUNT);
            expect(explores.map(({ name }) => name)).toEqual(
                models.map(({ name }) => name),
            );
            expect(durationMs).toBeLessThan(2000);
        },
        30000,
    );

    it('keeps every explore scoped to its base table and its joins', async () => {
        const models = buildScaleModels(MODEL_COUNT, true);

        const explores = await convertExplores(
            models,
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        const last = explores[explores.length - 1] as Explore;
        expect(Object.keys(last.tables)).toEqual([
            `m_${MODEL_COUNT - 1}`,
            `m_${MODEL_COUNT - 2}`,
        ]);

        const first = explores[0] as Explore;
        expect(Object.keys(first.tables)).toEqual(['m_0']);
    });
});

describe('nested and repeated columns', () => {
    const bigqueryClientMock = {
        ...warehouseClientMock,
        getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
        getFieldQuoteChar: () => '`',
    };
    const nestedColumn = (
        name: string,
        extra: Partial<DbtModelNode['columns'][string]> = {},
    ) => ({ name, meta: {}, ...extra });
    const gaSessions: DbtModelNode = {
        ...model,
        name: 'ga_sessions',
        alias: 'ga_sessions',
        unique_id: 'model.ga_sessions',
        database: 'db',
        schema: 'ds',
        relation_name: '`db`.`ds`.`ga_sessions`',
        meta: {},
        columns: {
            visitId: nestedColumn('visitId'),
            'totals.pageviews': nestedColumn('totals.pageviews'),
            hits: nestedColumn('hits', { description: 'One row per hit' }),
            'customDimensions.index': nestedColumn('customDimensions.index'),
            'customDimensions.value': nestedColumn('customDimensions.value'),
            'hits.page.pagePath': nestedColumn('hits.page.pagePath'),
            'hits.product.productSKU': nestedColumn('hits.product.productSKU'),
            'hits.product.productRevenue': nestedColumn(
                'hits.product.productRevenue',
                {
                    meta: {
                        metrics: { total_revenue: { type: MetricType.SUM } },
                    },
                },
            ),
        },
    };
    const catalog: WarehouseCatalog = {
        db: {
            ds: {
                ga_sessions: {
                    visitId: DimensionType.NUMBER,
                    totals: DimensionType.STRING,
                    'totals.pageviews': DimensionType.NUMBER,
                    customDimensions: DimensionType.STRING,
                    'customDimensions.index': DimensionType.NUMBER,
                    'customDimensions.value': DimensionType.STRING,
                    hits: DimensionType.STRING,
                    'hits.page': DimensionType.STRING,
                    'hits.page.pagePath': DimensionType.STRING,
                    'hits.product': DimensionType.STRING,
                    'hits.product.productSKU': DimensionType.STRING,
                    'hits.product.productRevenue': DimensionType.NUMBER,
                    tags: DimensionType.STRING,
                    'hits.page.keywords': DimensionType.STRING,
                },
            },
        },
    };
    Object.entries({
        totals: { repeated: false, record: true },
        customDimensions: { repeated: true, record: true },
        hits: { repeated: true, record: true },
        'hits.page': { repeated: false, record: true },
        'hits.product': { repeated: true, record: true },
        tags: { repeated: true, record: false },
        'hits.page.keywords': { repeated: true, record: false },
    }).forEach(([path, shape]) =>
        setCatalogNestedColumnShape(
            catalog,
            'db',
            'ds',
            'ga_sessions',
            path,
            shape,
        ),
    );
    const typedModels = attachTypesToModels([gaSessions], catalog, true);

    const compile = async (
        models: DbtModelNode[],
        unnestRepeatedColumns: boolean,
    ) => {
        const explores = await convertExplores(
            models,
            false,
            SupportedDbtAdapter.BIGQUERY,
            bigqueryClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { unnestRepeatedColumns },
        );
        const explore = explores.find((e) => e.name === 'ga_sessions');
        if (!explore || isExploreError(explore)) {
            throw new Error(JSON.stringify(explore));
        }
        return explore;
    };

    it('attaches the shape and repeated ancestors from the catalog', () => {
        const { columns } = typedModels[0];
        expect(columns.hits.nested_shape).toEqual({
            repeated: true,
            record: true,
        });
        expect(columns.hits.repeated_ancestors).toBeUndefined();
        expect(columns['totals.pageviews'].repeated_ancestors).toBeUndefined();
        expect(columns['hits.page.pagePath'].repeated_ancestors).toEqual([
            'hits',
        ]);
        expect(columns['hits.product.productSKU'].repeated_ancestors).toEqual([
            'hits',
            'hits.product',
        ]);
    });

    it("keeps today's dotted dimensions when unnesting is off", async () => {
        const explore = await compile(typedModels, false);
        expect(Object.keys(explore.tables)).toEqual(['ga_sessions']);
        expect(
            explore.tables.ga_sessions.dimensions['hits.product.productSKU']
                .compiledSql,
        ).toEqual('`ga_sessions`.hits.product.productSKU');
    });

    it('unnests each repeated node into a virtual table joined on TRUE', async () => {
        const explore = await compile(typedModels, true);
        expect(Object.keys(explore.tables).sort()).toEqual([
            'ga_sessions',
            'ga_sessions__customDimensions',
            'ga_sessions__hits',
            'ga_sessions__hits__product',
        ]);

        const base = explore.tables.ga_sessions;
        expect(Object.keys(base.dimensions).sort()).toEqual([
            'totals.pageviews',
            'visitId',
        ]);
        expect(base.dimensions['totals.pageviews'].compiledSql).toEqual(
            '`ga_sessions`.totals.pageviews',
        );

        const hits = explore.tables.ga_sessions__hits;
        expect(hits.nestedFrom).toEqual({
            parentTable: 'ga_sessions',
            columnPath: 'hits',
        });
        expect(hits.sqlTable).toEqual(
            'UNNEST(`ga_sessions`.hits) AS `ga_sessions__hits` WITH OFFSET AS `ga_sessions__hits__offset`',
        );
        expect(hits.label).toEqual('Ga sessions: Hits');
        expect(hits.description).toEqual('One row per hit');
        expect(hits.primaryKey).toBeUndefined();
        expect(Object.keys(hits.dimensions).sort()).toEqual([
            'offset',
            'page.pagePath',
        ]);
        expect(hits.dimensions['page.pagePath']).toMatchObject({
            table: 'ga_sessions__hits',
            type: DimensionType.STRING,
            compiledSql: '`ga_sessions__hits`.page.pagePath',
        });
        expect(hits.dimensions.offset).toMatchObject({
            type: DimensionType.NUMBER,
            compiledSql: '`ga_sessions__hits__offset`',
        });

        const product = explore.tables.ga_sessions__hits__product;
        expect(product.nestedFrom).toEqual({
            parentTable: 'ga_sessions__hits',
            columnPath: 'hits.product',
        });
        expect(product.sqlTable).toEqual(
            'UNNEST(`ga_sessions__hits`.product) AS `ga_sessions__hits__product` WITH OFFSET AS `ga_sessions__hits__product__offset`',
        );
        expect(product.label).toEqual('Ga sessions: Hits: Product');
        expect(product.metrics.total_revenue).toMatchObject({
            table: 'ga_sessions__hits__product',
            compiledSql: 'SUM(`ga_sessions__hits__product`.productRevenue)',
        });

        expect(
            explore.joinedTables.map(
                ({
                    table,
                    type,
                    relationship,
                    compiledSqlOn,
                    tablesReferences,
                }) => ({
                    table,
                    type,
                    relationship,
                    compiledSqlOn,
                    tablesReferences,
                }),
            ),
        ).toEqual([
            {
                table: 'ga_sessions__customDimensions',
                type: 'left',
                relationship: JoinRelationship.ONE_TO_MANY,
                compiledSqlOn: 'TRUE',
                tablesReferences: ['ga_sessions'],
            },
            {
                table: 'ga_sessions__hits',
                type: 'left',
                relationship: JoinRelationship.ONE_TO_MANY,
                compiledSqlOn: 'TRUE',
                tablesReferences: ['ga_sessions'],
            },
            {
                table: 'ga_sessions__hits__product',
                type: 'left',
                relationship: JoinRelationship.ONE_TO_MANY,
                compiledSqlOn: 'TRUE',
                tablesReferences: ['ga_sessions__hits'],
            },
        ]);
    });

    it("adds a joined model's virtual tables after its own join", async () => {
        const orders: DbtModelNode = {
            ...model,
            name: 'orders',
            alias: 'orders',
            unique_id: 'model.orders',
            database: 'db',
            schema: 'ds',
            relation_name: '`db`.`ds`.`orders`',
            columns: { id: nestedColumn('id') },
            meta: {
                joins: [
                    {
                        join: 'ga_sessions',
                        sql_on: '${orders.id} = ${ga_sessions.visitId}',
                    },
                ],
            },
        };
        const explores = await convertExplores(
            [orders, ...typedModels],
            false,
            SupportedDbtAdapter.BIGQUERY,
            bigqueryClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { unnestRepeatedColumns: true },
        );
        const explore = explores.find((e) => e.name === 'orders');
        if (!explore || isExploreError(explore)) {
            throw new Error(JSON.stringify(explore));
        }
        expect(explore.joinedTables.map(({ table }) => table)).toEqual([
            'ga_sessions',
            'ga_sessions__customDimensions',
            'ga_sessions__hits',
            'ga_sessions__hits__product',
        ]);
    });

    it('instantiates virtual tables per join alias, referencing the alias in the UNNEST', async () => {
        const orders: DbtModelNode = {
            ...model,
            name: 'orders',
            alias: 'orders',
            unique_id: 'model.orders',
            database: 'db',
            schema: 'ds',
            relation_name: '`db`.`ds`.`orders`',
            columns: { id: nestedColumn('id') },
            meta: {
                joins: [
                    {
                        join: 'ga_sessions',
                        alias: 'first_session',
                        sql_on: '${orders.id} = ${first_session.visitId}',
                    },
                    {
                        join: 'ga_sessions',
                        alias: 'second_session',
                        label: 'Return visit',
                        sql_on: '${orders.id} = ${second_session.visitId}',
                    },
                ],
            },
        };
        const explores = await convertExplores(
            [orders, ...typedModels],
            false,
            SupportedDbtAdapter.BIGQUERY,
            bigqueryClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { unnestRepeatedColumns: true },
        );
        const explore = explores.find((e) => e.name === 'orders');
        if (!explore || isExploreError(explore)) {
            throw new Error(JSON.stringify(explore));
        }
        expect(explore.joinedTables.map(({ table }) => table)).toEqual([
            'first_session',
            'first_session__customDimensions',
            'first_session__hits',
            'first_session__hits__product',
            'second_session',
            'second_session__customDimensions',
            'second_session__hits',
            'second_session__hits__product',
        ]);
        const firstHits = explore.tables.first_session__hits;
        expect(firstHits.sqlTable).toEqual(
            'UNNEST(`first_session`.hits) AS `first_session__hits` WITH OFFSET AS `first_session__hits__offset`',
        );
        expect(firstHits.nestedFrom).toEqual({
            parentTable: 'first_session',
            columnPath: 'hits',
        });
        expect(firstHits.dimensions['page.pagePath'].compiledSql).toEqual(
            '`first_session__hits`.page.pagePath',
        );
        expect(
            explore.joinedTables.find(
                ({ table }) => table === 'first_session__hits__product',
            )?.tablesReferences,
        ).toEqual(['first_session__hits']);
        const secondProduct = explore.tables.second_session__hits__product;
        expect(secondProduct.sqlTable).toEqual(
            'UNNEST(`second_session__hits`.product) AS `second_session__hits__product` WITH OFFSET AS `second_session__hits__product__offset`',
        );
        expect(secondProduct.label).toEqual('Return visit: Hits: Product');
        expect(secondProduct.metrics.total_revenue.compiledSql).toEqual(
            'SUM(`second_session__hits__product`.productRevenue)',
        );
        expect(explore.tables.ga_sessions__hits).toBeUndefined();
    });

    it('keeps additional dimensions and explicit-SQL metrics declared under a struct container', async () => {
        const jobs: DbtModelNode = {
            ...gaSessions,
            columns: {
                visitId: nestedColumn('visitId'),
                totals: nestedColumn('totals', {
                    meta: {
                        dimension: { type: DimensionType.STRING, hidden: true },
                        additional_dimensions: {
                            pageviews_bucket: {
                                type: DimensionType.STRING,
                                sql: "CASE WHEN ${TABLE}.totals.pageviews > 5 THEN 'many' ELSE 'few' END",
                            },
                        },
                        metrics: {
                            sessions_with_visits: {
                                type: MetricType.COUNT,
                                sql: '${TABLE}.totals.visits',
                            },
                            container_count: { type: MetricType.COUNT },
                        },
                    },
                }),
            },
        };
        const explore = await compile(
            attachTypesToModels([jobs], catalog, true),
            true,
        );
        const table = explore.tables.ga_sessions;
        expect(Object.keys(table.dimensions).sort()).toEqual([
            'pageviews_bucket',
            'visitId',
        ]);
        expect(table.dimensions.pageviews_bucket.compiledSql).toEqual(
            "CASE WHEN `ga_sessions`.totals.pageviews > 5 THEN 'many' ELSE 'few' END",
        );
        expect(Object.keys(table.metrics).sort()).toEqual([
            'container_count',
            'sessions_with_visits',
        ]);
        expect(table.metrics.sessions_with_visits.compiledSql).toEqual(
            '`ga_sessions`.totals.visits',
        );
        expect(table.metrics.container_count.compiledSql).toEqual(
            '`ga_sessions`.totals',
        );
    });

    it('unnests an array of scalars into a virtual table with a value dimension', async () => {
        const taggedSessions: DbtModelNode = {
            ...gaSessions,
            columns: {
                visitId: nestedColumn('visitId'),
                tags: nestedColumn('tags', {
                    description: 'Session tags',
                    meta: {
                        dimension: { label: 'Tag list' },
                        additional_dimensions: {
                            tag_count: {
                                type: DimensionType.NUMBER,
                                sql: 'ARRAY_LENGTH(${TABLE}.tags)',
                            },
                        },
                        metrics: {
                            last_tag: { type: MetricType.MAX },
                        },
                    },
                }),
                'hits.page.keywords': nestedColumn('hits.page.keywords'),
            },
        };
        const explore = await compile(
            attachTypesToModels([taggedSessions], catalog, true),
            true,
        );
        expect(Object.keys(explore.tables).sort()).toEqual([
            'ga_sessions',
            'ga_sessions__hits',
            'ga_sessions__hits__page__keywords',
            'ga_sessions__tags',
        ]);
        expect(Object.keys(explore.tables.ga_sessions.dimensions)).toEqual([
            'visitId',
            'tag_count',
        ]);
        expect(
            explore.tables.ga_sessions.dimensions.tag_count.compiledSql,
        ).toEqual('ARRAY_LENGTH(`ga_sessions`.tags)');
        expect(explore.tables.ga_sessions.metrics.last_tag).toBeUndefined();

        const tags = explore.tables.ga_sessions__tags;
        expect(tags.label).toEqual('Tag list');
        expect(tags.description).toEqual('Session tags');
        expect(tags.sqlTable).toEqual(
            'UNNEST(`ga_sessions`.tags) AS `ga_sessions__tags` WITH OFFSET AS `ga_sessions__tags__offset`',
        );
        expect(Object.keys(tags.dimensions).sort()).toEqual([
            'offset',
            'value',
        ]);
        expect(Object.keys(tags.metrics)).toEqual(['last_tag']);
        expect(tags.dimensions.value).toMatchObject({
            type: DimensionType.STRING,
            label: 'Value',
            compiledSql: '`ga_sessions__tags`',
        });
        expect(tags.metrics.last_tag.compiledSql).toEqual(
            'MAX(`ga_sessions__tags`)',
        );

        // An array below a struct inside a repeated record unnests from the
        // repeated parent, with the struct path in the segment.
        const keywords = explore.tables.ga_sessions__hits__page__keywords;
        expect(keywords.nestedFrom).toEqual({
            parentTable: 'ga_sessions__hits',
            columnPath: 'hits.page.keywords',
        });
        expect(keywords.sqlTable).toEqual(
            'UNNEST(`ga_sessions__hits`.page.keywords) AS `ga_sessions__hits__page__keywords` WITH OFFSET AS `ga_sessions__hits__page__keywords__offset`',
        );
        expect(keywords.label).toEqual('Ga sessions: Hits: Page: Keywords');
        expect(keywords.dimensions.value.compiledSql).toEqual(
            '`ga_sessions__hits__page__keywords`',
        );
        expect(
            Object.keys(explore.tables.ga_sessions__hits.dimensions),
        ).toEqual(['offset']);
        expect(
            explore.joinedTables.map(({ table, tablesReferences }) => [
                table,
                tablesReferences,
            ]),
        ).toEqual([
            ['ga_sessions__hits', ['ga_sessions']],
            ['ga_sessions__tags', ['ga_sessions']],
            ['ga_sessions__hits__page__keywords', ['ga_sessions__hits']],
        ]);
    });

    it('fails the model when a virtual table name collides with a model', async () => {
        const collidingModel: DbtModelNode = {
            ...model,
            name: 'ga_sessions__hits',
            alias: 'ga_sessions__hits',
            unique_id: 'model.ga_sessions__hits',
            columns: { id: nestedColumn('id') },
            meta: {},
        };
        const explores = await convertExplores(
            [collidingModel, ...typedModels],
            false,
            SupportedDbtAdapter.BIGQUERY,
            bigqueryClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { unnestRepeatedColumns: true },
        );
        const explore = explores.find((e) => e.name === 'ga_sessions');
        expect(explore && isExploreError(explore)).toBe(true);
        expect(JSON.stringify(explore)).toContain(
            'already used by another table',
        );
    });
});
