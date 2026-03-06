import { MessageContent } from '@langchain/core/messages';
import {
    assertUnreachable,
    BinType,
    isAdditionalMetric,
    isCustomBinDimension,
    isCustomSqlDimension,
    isField,
    isMetric,
    isSqlTableCalculation,
    isTableCalculation,
    Item,
    ResultRow,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';

export async function makeResultsCSV(columns: string[], data: ResultRow[]) {
    const rows = data.map((row) =>
        columns.map((col) => row[col].value.formatted),
    );

    return new Promise<string>((resolve, reject) => {
        stringify([columns, ...rows], { delimiter: ',' }, (err, output) => {
            if (err) {
                reject(err);
            }
            resolve(output);
        });
    });
}

export function fieldDesc(fieldName: string, item: Item) {
    if (isCustomSqlDimension(item)) {
        return ` - ${fieldName}: this column is a custom dimension which will be the result of the following SQL \`${item.sql}\``;
    }

    if (isCustomBinDimension(item)) {
        let binString = '';

        switch (item.binType) {
            case BinType.FIXED_NUMBER:
                binString = `- having ${item.binNumber} bin${
                    item.binNumber > 1 ? 's' : ''
                }`;
                break;
            case BinType.CUSTOM_RANGE:
                binString = `having custom ranges: ${item.customRange.join(
                    ', ',
                )}`;
                break;
            case BinType.FIXED_WIDTH:
                binString = `having fixed width: ${item.binWidth}`;
                break;
            case BinType.CUSTOM_GROUP:
                binString = `having custom groups: ${item.customGroups
                    .map(
                        (g) =>
                            `${g.name} (${g.values.map((v) => `${v.matchType}: ${v.value}`).join(', ')})`,
                    )
                    .join('; ')}`;
                break;
            default:
                return assertUnreachable(item, `unknown bin type`);
        }
        return ` - ${fieldName}: this column is a custom dimension which aggregates the "${item.dimensionId}" dimension into "${item.binType}" bins ${binString}`;
    }

    if (isTableCalculation(item)) {
        if (isSqlTableCalculation(item)) {
            return ` - ${fieldName}: this column is a table calculation which will be the result of the following SQL \`${item.sql}\``;
        }
        return ` - ${fieldName}: this column is a table calculation`;
    }

    if (isAdditionalMetric(item)) {
        return ` - ${fieldName}: this column is a metric on the dimension "${item.baseDimensionName}" of type "${item.type}" and has the following SQL: \`${item.sql}\``;
    }

    if (isField(item) || isMetric(item)) {
        const descriptionString = item.description
            ? `with the description "${item.description}"`
            : '';
        return ` - ${fieldName}: this column is a ${item.fieldType} ${descriptionString} and has the following SQL: \`${item.sql}\``;
    }

    throw new Error(`Unknown field type for field ${fieldName}`);
}

export function formatSummary(summary: {
    chartName: string;
    summary: MessageContent;
}) {
    return `<chart_insights_observations>\nChart name: ${summary.chartName}\nSummary:\n${summary.summary}\n</chart_insights_observations>\n`;
}

export function formatSummaryArray(
    summaries: { chartName: string; summary: MessageContent }[],
) {
    return summaries.map(formatSummary).join('\n');
}
