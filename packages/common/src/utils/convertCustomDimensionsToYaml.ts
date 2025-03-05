import type { DbtColumnLightdashAdditionalDimension } from '../types/dbt';
import { NotImplementedError } from '../types/errors';
import {
    BinType,
    type CustomBinDimension,
    type CustomSqlDimension,
    DimensionType,
    friendlyName,
} from '../types/field';
import { type WarehouseClient } from '../types/warehouse';
import {
    getCustomRangeSelectSql,
    getFixedWidthBinSelectSql,
} from './customDimensions';

export const convertCustomDimensionToDbt = (
    field: CustomSqlDimension,
): DbtColumnLightdashAdditionalDimension => ({
    label: friendlyName(field.name),
    description: '', // TODO :: leave it here so that customer can easily fill in?
    type: field.dimensionType,
    sql: field.sql,
});

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
