import { type BinGroup, type BinRange } from '../types/field';
import { type WarehouseSqlBuilder } from '../types/warehouse';

const createEscapeValue = (
    quoteChar: string,
    escapeChar: string,
): ((value: string) => string) => {
    if (escapeChar === quoteChar) {
        return (value: string) =>
            value.split(quoteChar).join(`${quoteChar}${quoteChar}`);
    }
    return (value: string) =>
        value
            .split(escapeChar)
            .join(`${escapeChar}${escapeChar}`)
            .split(quoteChar)
            .join(`${escapeChar}${quoteChar}`);
};

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

export const getCustomGroupSelectSql = ({
    binGroups,
    baseDimensionSql,
    warehouseSqlBuilder,
}: {
    binGroups: BinGroup[];
    baseDimensionSql: string;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}) => {
    const quoteChar = warehouseSqlBuilder.getStringQuoteChar();
    const escapeChar = warehouseSqlBuilder.getEscapeStringQuoteChar();
    const escapeValue = createEscapeValue(quoteChar, escapeChar);

    const nonEmptyGroups = binGroups.filter((group) => group.values.length > 0);

    const groupWhens = nonEmptyGroups.map((group) => {
        const inValues = group.values
            .map((v) => `${quoteChar}${escapeValue(v)}${quoteChar}`)
            .join(', ');
        return `WHEN ${baseDimensionSql} IN (${inValues}) THEN ${quoteChar}${escapeValue(group.name)}${quoteChar}`;
    });

    const whens = [
        `WHEN ${baseDimensionSql} IS NULL THEN NULL`,
        ...groupWhens,
        `ELSE ${quoteChar}Other${quoteChar}`,
    ];

    return `CASE
            ${whens.join('\n')}
            END`;
};

export const getCustomGroupOrderSql = ({
    binGroups,
    baseDimensionSql,
    warehouseSqlBuilder,
}: {
    binGroups: BinGroup[];
    baseDimensionSql: string;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}) => {
    const quoteChar = warehouseSqlBuilder.getStringQuoteChar();
    const escapeChar = warehouseSqlBuilder.getEscapeStringQuoteChar();
    const escapeValue = createEscapeValue(quoteChar, escapeChar);

    const nonEmptyGroups = binGroups.filter((group) => group.values.length > 0);

    const groupWhens = nonEmptyGroups.map((group, index) => {
        const inValues = group.values
            .map((v) => `${quoteChar}${escapeValue(v)}${quoteChar}`)
            .join(', ');
        return `WHEN ${baseDimensionSql} IN (${inValues}) THEN ${index}`;
    });

    const whens = [
        `WHEN ${baseDimensionSql} IS NULL THEN NULL`,
        ...groupWhens,
        `ELSE ${nonEmptyGroups.length}`,
    ];

    return `CASE
            ${whens.join('\n')}
            END`;
};
