import type { DbtColumnLightdashAdditionalDimension, DbtColumnLightdashDimension } from '../types/dbt';
import { NotImplementedError } from '../types/errors';
import {
    BinType,
    type CustomBinDimension, type CustomDimension,
    type CustomSqlDimension,
    DimensionType,
    friendlyName, isCustomBinDimension,
} from '../types/field';
import { type WarehouseClient } from '../types/warehouse';
import {
    getCustomRangeSelectSql,
    getFixedWidthBinSelectSql,
} from './customDimensions';

export const convertCustomDimensionToDbt = (
    field: CustomDimension,
): DbtColumnLightdashDimension => {
    if (isCustomBinDimension(field)) {
        throw new NotImplementedError(
            'Custom bin dimensions are not supported yet',
        );
    }
    return {
        label: friendlyName(field.name),
        name: field.id,
        type: field.dimensionType,
        sql: field.sql,
    };
};

export const convertCustomBinDimensionToYaml = ({
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
                'Fixed number bin type not supported',
            );
        default:
            const never: never = customDimension.binType;
            throw new Error(`Unknown bin type ${never}`);
    }
};
