import { type DbtColumnLightdashAdditionalDimension } from '../types/dbt';
import { NotImplementedError } from '../types/errors';
import {
    BinType,
    type CustomBinDimension,
    type CustomDimension,
    type CustomSqlDimension,
    DimensionType,
    friendlyName,
    isCustomBinDimension,
} from '../types/field';
import { type CreateWarehouseCredentials } from '../types/projects';
import { type WarehouseClient } from '../types/warehouse';
import {
    getCustomRangeSelectSql,
    getFixedWidthBinSelectSql,
} from './customDimensions';

export const convertCustomSqlDimensionToDbt = (
    field: CustomSqlDimension,
): DbtColumnLightdashAdditionalDimension => ({
    label: friendlyName(field.name),
    type: field.dimensionType,
    sql: field.sql,
});

export const convertCustomBinDimensionToDbt = ({
    customDimension,
    baseDimensionSql,
    warehouseClient,
}: {
    customDimension: CustomBinDimension;
    baseDimensionSql: string;
    warehouseClient: WarehouseClient;
}): DbtColumnLightdashAdditionalDimension => {
    switch (customDimension.binType) {
        case BinType.CUSTOM_RANGE:
            return {
                label: friendlyName(customDimension.name),
                type: DimensionType.STRING,
                sql: getCustomRangeSelectSql({
                    binRanges: customDimension.customRange || [],
                    baseDimensionSql,
                    warehouseClient,
                }),
            };
        case BinType.FIXED_WIDTH:
            return {
                label: friendlyName(customDimension.name),
                type: DimensionType.STRING,
                sql: getFixedWidthBinSelectSql({
                    binWidth: customDimension.binWidth || 1,
                    baseDimensionSql,
                    warehouseClient,
                }),
            };
        case BinType.FIXED_NUMBER:
            throw new NotImplementedError(
                'Bin with fixed number of bins can not be converted to dbt as it requires a CTE',
            );
        default:
            const never: never = customDimension.binType;
            throw new Error(`Unknown bin type ${never}`);
    }
};

// Mock Bigquery warehouse client for preview
const warehouseClientMock: WarehouseClient = {
    credentials: undefined as unknown as CreateWarehouseCredentials,
    getCatalog() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    getAdapterType() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    getAllTables() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    getFields() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    getMetricSql() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    getStartOfWeek() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    parseError() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    parseWarehouseCatalog() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    runQuery() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    streamQuery() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    executeAsyncQuery() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    test() {
        throw new NotImplementedError('getCatalog not implemented');
    },
    concatString(...args: string[]): string {
        return `CONCAT(${args.join(', ')})`;
    },
    getStringQuoteChar() {
        return "'";
    },
    getEscapeStringQuoteChar() {
        return '\\';
    },
    getFieldQuoteChar() {
        return '"';
    },
};

export const previewConvertCustomDimensionToDbt = (
    field: CustomDimension,
): DbtColumnLightdashAdditionalDimension => {
    if (isCustomBinDimension(field)) {
        // Mock base dimension SQL and warehouse client for preview
        const preview = convertCustomBinDimensionToDbt({
            customDimension: field,
            baseDimensionSql: '${reference_column}',
            warehouseClient: warehouseClientMock,
        });
        return {
            ...preview,
            // Add a comment at the top of the multiline string to indicate that this is a preview
            sql: `/* This is a preview! Replace column references and confirm SQL before using in production. */\n${preview.sql}`,
        };
    }
    return convertCustomSqlDimensionToDbt(field);
};
