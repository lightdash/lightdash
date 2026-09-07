import { type DbtColumnLightdashAdditionalDimension } from '../types/dbt';
import { NotImplementedError } from '../types/errors';
import {
    BinType,
    DimensionType,
    friendlyName,
    isCustomBinDimension,
    type CustomBinDimension,
    type CustomDimension,
    type CustomSqlDimension,
} from '../types/field';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import assertUnreachable from './assertUnreachable';
import {
    getCustomGroupSelectSql,
    getCustomRangeSelectSql,
    getFixedWidthBinSelectSql,
} from './customDimensions';

export const FIXED_NUMBER_BIN_WRITE_BACK_ERROR =
    'Fixed-number bins cannot be written back because they require a dbt model CTE. Use a fixed-width, custom-range, or custom-group bin instead.';

export const getCustomDimensionWriteBackError = (
    customDimension: CustomDimension,
): string | null =>
    isCustomBinDimension(customDimension) &&
    customDimension.binType === BinType.FIXED_NUMBER
        ? FIXED_NUMBER_BIN_WRITE_BACK_ERROR
        : null;

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
    warehouseSqlBuilder,
}: {
    customDimension: CustomBinDimension;
    baseDimensionSql: string;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): DbtColumnLightdashAdditionalDimension => {
    switch (customDimension.binType) {
        case BinType.CUSTOM_RANGE:
            return {
                label: friendlyName(customDimension.name),
                type: DimensionType.STRING,
                sql: getCustomRangeSelectSql({
                    binRanges: customDimension.customRange,
                    baseDimensionSql,
                    warehouseSqlBuilder,
                }),
            };
        case BinType.FIXED_WIDTH:
            return {
                label: friendlyName(customDimension.name),
                type: DimensionType.STRING,
                sql: getFixedWidthBinSelectSql({
                    binWidth: customDimension.binWidth,
                    baseDimensionSql,
                    warehouseSqlBuilder,
                }),
            };
        case BinType.FIXED_NUMBER:
            throw new NotImplementedError(
                'Bin with fixed number of bins can not be converted to dbt as it requires a CTE',
            );
        case BinType.CUSTOM_GROUP:
            return {
                label: friendlyName(customDimension.name),
                type: DimensionType.STRING,
                sql: getCustomGroupSelectSql({
                    binGroups: customDimension.customGroups,
                    baseDimensionSql,
                    warehouseSqlBuilder,
                }),
            };
        default:
            throw new Error(
                `Unknown bin type ${assertUnreachable(customDimension, 'Unknown bin type')}`,
            );
    }
};

export const previewConvertCustomDimensionToDbt = (
    field: CustomDimension,
): DbtColumnLightdashAdditionalDimension => {
    if (isCustomBinDimension(field)) {
        throw new NotImplementedError(
            'Custom bin previews require the project warehouse and dbt model SQL',
        );
    }
    return convertCustomSqlDimensionToDbt(field);
};
