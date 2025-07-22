import { type BinRange } from '../types/field';
import { type WarehouseSqlBuilder } from '../types/warehouse';

export const getFixedWidthBinSelectSql = ({
    binWidth,
    baseDimensionSql,
    warehouseSqlBuilder,
}: {
    binWidth: number;
    baseDimensionSql: string;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}) => {
    const quoteChar = warehouseSqlBuilder.getStringQuoteChar();
    return `${warehouseSqlBuilder.concatString(
        `FLOOR(${baseDimensionSql} / ${binWidth}) * ${binWidth}`,
        `${quoteChar} - ${quoteChar}`,
        `(FLOOR(${baseDimensionSql} / ${binWidth}) + 1) * ${binWidth} - 1`,
    )}`;
};

export const getCustomRangeSelectSql = ({
    binRanges,
    baseDimensionSql,
    warehouseSqlBuilder,
}: {
    binRanges: BinRange[];
    baseDimensionSql: string;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}) => {
    const quoteChar = warehouseSqlBuilder.getStringQuoteChar();
    const binRangeWhens = binRanges.map((range) => {
        if (range.from === undefined) {
            // First range
            return `WHEN ${baseDimensionSql} < ${
                range.to
            } THEN ${warehouseSqlBuilder.concatString(
                `${quoteChar}<${quoteChar}`,
                `${range.to}`,
            )}`;
        }
        if (range.to === undefined) {
            // Last range
            return `ELSE ${warehouseSqlBuilder.concatString(
                `${quoteChar}≥${quoteChar}`,
                `${range.from}`,
            )}`;
        }

        return `WHEN ${baseDimensionSql} >= ${
            range.from
        } AND ${baseDimensionSql} < ${
            range.to
        } THEN ${warehouseSqlBuilder.concatString(
            `${range.from}`,
            "'-'",
            `${range.to}`,
        )}`;
    });

    // Add a NULL case for when the dimension is NULL, returning null as the value so it get's correctly formated with the symbol ∅
    const rangeWhens = [
        `WHEN ${baseDimensionSql} IS NULL THEN NULL`,
        ...binRangeWhens,
    ];

    return `CASE
            ${rangeWhens.join('\n')}
            END`;
};
