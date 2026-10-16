import {
    ExploreCompiler,
    ExploreType,
    getAggregatedField,
    quoteFieldReference,
    SupportedDbtAdapter,
    VizAggregationOptions,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { encryptionUtilMock } from '../../models/ProjectModel/ProjectModel.mock';
import { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { warehouseConnectionCredentials } from '../../services/WarehouseConnectionService/warehouseConnectionFixtures.mock';
import { getSqlBuilderForExplore } from './getSqlBuilderForExplore';
import { MetricQueryBuilder } from './MetricQueryBuilder';
import {
    CUSTOM_SQL_DIMENSION,
    EXPLORE,
    METRIC_QUERY,
} from './MetricQueryBuilder.mock';
import { getCustomSqlDimensionSql } from './utils';

type ModelArguments = ConstructorParameters<typeof ProjectModel>[0];

const dialects = {
    [WarehouseTypes.POSTGRES]: '"',
    [WarehouseTypes.REDSHIFT]: '"',
    [WarehouseTypes.SNOWFLAKE]: '"',
    [WarehouseTypes.BIGQUERY]: '`',
    [WarehouseTypes.DATABRICKS]: '`',
    [WarehouseTypes.TRINO]: '"',
    [WarehouseTypes.ATHENA]: '"',
    [WarehouseTypes.CLICKHOUSE]: '"',
    [WarehouseTypes.DUCKDB]: '"',
} satisfies Record<WarehouseTypes, string>;

const pairs = Object.values(WarehouseTypes).map((extraType) => ({
    originalType:
        extraType === WarehouseTypes.POSTGRES
            ? WarehouseTypes.BIGQUERY
            : WarehouseTypes.POSTGRES,
    extraType,
}));
pairs.push({
    originalType: WarehouseTypes.BIGQUERY,
    extraType: WarehouseTypes.TRINO,
});

describe('bound connection SQL dialect', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(pairs)(
        'resolves $extraType with an original $originalType connection',
        async ({ originalType, extraType }) => {
            const projectModel = new ProjectModel({
                database: {} as ModelArguments['database'],
                encryptionUtil: encryptionUtilMock,
                lightdashConfig: lightdashConfigMock,
            });
            const resolve = vi
                .spyOn(projectModel, 'resolveWarehouseCredentialRead')
                .mockResolvedValue({
                    kind: 'extra',
                    warehouseConnectionUuid: 'extra',
                });
            const primary = vi
                .spyOn(projectModel, 'getWarehouseCredentialsForProject')
                .mockResolvedValue({
                    ...warehouseConnectionCredentials[originalType],
                    startOfWeek: WeekDay.SUNDAY,
                });
            vi.spyOn(
                WarehouseConnectionModel.prototype,
                'getProject',
            ).mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                connectionMode: 'multi',
                originalWarehouseType: originalType,
            });
            const extra = vi
                .spyOn(WarehouseConnectionModel.prototype, 'getCredentials')
                .mockResolvedValue({
                    ...warehouseConnectionCredentials[extraType],
                    startOfWeek: WeekDay.WEDNESDAY,
                });
            const credentials =
                await projectModel.getWarehouseConnectionForBinding('project', {
                    kind: 'explore',
                    exploreName: 'orders',
                });
            const builder = getSqlBuilderForExplore(
                { type: ExploreType.DEFAULT },
                credentials,
            );
            expect(resolve).toHaveBeenCalledWith('project', {
                kind: 'explore',
                exploreName: 'orders',
            });
            expect(extra).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: 'project' }),
                'extra',
            );
            expect(primary).not.toHaveBeenCalled();
            expect(builder.getAdapterType()).toBe(extraType);
            expect(builder.getFieldQuoteChar()).toBe(dialects[extraType]);
            expect(builder.getStartOfWeek()).toBe(WeekDay.WEDNESDAY);
        },
    );
});

describe('bound SQL identifier quoting', () => {
    const builders = Object.values(WarehouseTypes).map((type) => ({
        type,
        builder: getSqlBuilderForExplore(
            { type: ExploreType.DEFAULT },
            warehouseConnectionCredentials[type],
        ),
    }));
    it.each(builders)(
        'contains hostile field, table and alias identifiers for $type with the shared helper',
        ({ builder }) => {
            const quote = builder.getFieldQuoteChar();
            const adapter = builder.getAdapterType();
            for (const role of ['field', 'table', 'alias']) {
                const identifier = `${role}${quote};--\n/* comment */\\path`;
                const quoted = quoteFieldReference(identifier, quote, adapter);
                const expected =
                    adapter === SupportedDbtAdapter.BIGQUERY
                        ? `${quote}${identifier.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}${quote}`
                        : `${quote}${identifier.replaceAll(quote, quote + quote)}${quote}`;
                expect(quoted).toBe(expected);
                expect(
                    getAggregatedField(
                        builder,
                        VizAggregationOptions.SUM,
                        identifier,
                    ),
                ).toBe(`sum(${expected})`);
            }
        },
    );
    it.fails.each(builders)(
        'known existing gap: escapes the table alias in compiled TABLE references for $type',
        ({ builder }) => {
            const identifier = `table${builder.getFieldQuoteChar()};--\n/* comment */`;
            const compiler = new ExploreCompiler(builder);
            expect(
                compiler.compileDimensionReference('TABLE', {}, identifier).sql,
            ).toBe(
                quoteFieldReference(
                    identifier,
                    builder.getFieldQuoteChar(),
                    builder.getAdapterType(),
                ),
            );
        },
    );
    it.fails.each(builders)(
        'known existing gap: escapes the FROM table alias for $type',
        ({ builder }) => {
            const alias = `table${builder.getFieldQuoteChar()};--\n/* comment */`;
            const queryBuilder = new MetricQueryBuilder({
                explore: {
                    ...EXPLORE,
                    baseTable: alias,
                    tables: {
                        [alias]: { ...EXPLORE.tables.table1, name: alias },
                    },
                },
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    dimensions: [],
                    metrics: [],
                    sorts: [],
                    compiledTableCalculations: [],
                    tableCalculations: [],
                },
                warehouseSqlBuilder: builder,
                parameterDefinitions: {},
                intrinsicUserAttributes: {},
                timezone: 'UTC',
            });
            const internals = queryBuilder as unknown as {
                getBaseTableFromSQL: () => string;
            };
            expect(internals.getBaseTableFromSQL()).toBe(
                `FROM ${EXPLORE.tables.table1.sqlTable} AS ${quoteFieldReference(alias, builder.getFieldQuoteChar(), builder.getAdapterType())}`,
            );
        },
    );
    it.fails.each(builders)(
        'known existing gap: escapes custom SQL dimension identifiers for $type',
        ({ builder }) => {
            const id = `dimension${builder.getFieldQuoteChar()};--\n/* comment */`;
            const response = getCustomSqlDimensionSql({
                warehouseSqlBuilder: builder,
                customDimensions: [{ ...CUSTOM_SQL_DIMENSION, id, name: id }],
            });
            expect(response?.selects[id]).toBe(
                `  (${CUSTOM_SQL_DIMENSION.compiledSql}) AS ${quoteFieldReference(id, builder.getFieldQuoteChar(), builder.getAdapterType())}`,
            );
        },
    );
});
