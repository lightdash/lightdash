import {
    GroupValueMatchType,
    type BinGroup,
    type BinRange,
    type GroupValueRule,
} from '../types/field';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import assertUnreachable from './assertUnreachable';

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

const renderValueCondition = (
    rule: GroupValueRule,
    baseDimensionSql: string,
    quoteChar: string,
    escapeValue: (value: string) => string,
): string => {
    const escaped = escapeValue(rule.value);
    switch (rule.matchType) {
        case GroupValueMatchType.EXACT:
            return `${baseDimensionSql} = ${quoteChar}${escaped}${quoteChar}`;
        case GroupValueMatchType.STARTS_WITH:
            return `${baseDimensionSql} LIKE ${quoteChar}${escaped}%${quoteChar}`;
        case GroupValueMatchType.ENDS_WITH:
            return `${baseDimensionSql} LIKE ${quoteChar}%${escaped}${quoteChar}`;
        case GroupValueMatchType.INCLUDES:
            return `${baseDimensionSql} LIKE ${quoteChar}%${escaped}%${quoteChar}`;
        default:
            return assertUnreachable(
                rule.matchType,
                `Unknown match type: ${rule.matchType}`,
            );
    }
};

const renderGroupCondition = (
    rules: GroupValueRule[],
    baseDimensionSql: string,
    quoteChar: string,
    escapeValue: (value: string) => string,
): string => {
    // Optimise: batch exact-match rules into a single IN clause
    const exactRules = rules.filter(
        (r) => r.matchType === GroupValueMatchType.EXACT,
    );
    const patternRules = rules.filter(
        (r) => r.matchType !== GroupValueMatchType.EXACT,
    );

    const conditions: string[] = [];

    if (exactRules.length === 1) {
        conditions.push(
            renderValueCondition(
                exactRules[0],
                baseDimensionSql,
                quoteChar,
                escapeValue,
            ),
        );
    } else if (exactRules.length > 1) {
        const inValues = exactRules
            .map((r) => `${quoteChar}${escapeValue(r.value)}${quoteChar}`)
            .join(', ');
        conditions.push(`${baseDimensionSql} IN (${inValues})`);
    }

    for (const rule of patternRules) {
        conditions.push(
            renderValueCondition(
                rule,
                baseDimensionSql,
                quoteChar,
                escapeValue,
            ),
        );
    }

    if (conditions.length === 1) {
        return conditions[0];
    }
    return `(${conditions.join(' OR ')})`;
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
        const condition = renderGroupCondition(
            group.values,
            baseDimensionSql,
            quoteChar,
            escapeValue,
        );
        return `WHEN ${condition} THEN ${quoteChar}${escapeValue(group.name)}${quoteChar}`;
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
        const condition = renderGroupCondition(
            group.values,
            baseDimensionSql,
            quoteChar,
            escapeValue,
        );
        return `WHEN ${condition} THEN ${index}`;
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
