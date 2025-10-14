import { z } from 'zod';
import {
    CustomFormatType,
    NumberSeparator,
    TableCalculationTemplateType,
    TableCalculationType,
    WindowFunctionType,
    type TableCalculation,
} from '../../../../types/field';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { tableCalcPercentChangeFromPreviousSchema } from './tableCalcPercentChangeFromPrevious';
import { tableCalcPercentOfColumnTotalSchema } from './tableCalcPercentOfColumnTotal';
import { tableCalcPercentOfPreviousValueSchema } from './tableCalcPercentOfPreviousValue';
import { tableCalcRankInColumnSchema } from './tableCalcRankInColumn';
import { tableCalcRunningTotalSchema } from './tableCalcRunningTotal';
import { tableCalcWindowFunctionSchema } from './tableCalcWindowFunction';

const tableCalcSchema = z.discriminatedUnion('type', [
    tableCalcPercentChangeFromPreviousSchema,
    tableCalcPercentOfPreviousValueSchema,
    tableCalcPercentOfColumnTotalSchema,
    tableCalcRankInColumnSchema,
    tableCalcRunningTotalSchema,
    tableCalcWindowFunctionSchema,
]);

export type TableCalcSchema = z.infer<typeof tableCalcSchema>;
// TODO improve description
export const tableCalcsSchema = z.array(tableCalcSchema).nullable().describe(`
Table calculations are a way to perform calculations across row sets without collapsing rows. You can think of them like SQL Window Functions.

Create table calculations when:

- User requests percentage change between columns
  Examples: "Show revenue growth from last month", "Calculate MoY/Month-over-month, YoY/Year-over-year sales change"
  Recommended visualization type: Table, bar chart

- User requests percentage of column compared to previous row
  Examples: "Show revenue as % of previous month", "What percent is each quarter vs the prior quarter"
  Recommended visualization type: Table, bar chart

- User requests percentage of column total
  Examples: "Show each product as % of total sales", "What percentage does each region contribute to overall revenue", "Show sales as % of total for each category"
  Recommended visualization type: Table, Bar chart

- User requests rank within a column
  Examples: "Rank customers by revenue", "Show top performing sales reps by deal count"
  Recommended visualization type: Table, Bar chart

- User requests running total
  Examples: "Show cumulative revenue over time", "Running sum of orders by month"
  Recommended visualization type: Line chart for the table calculation as Y axis and time as X axis

- User requests row numbering or percentile ranking
  Examples: "Number rows by order date", "Rank customers within each country by revenue", "Calculate percentile rank of sales"
  Recommended visualization type: Table, Bar chart
`);

export type TableCalcsSchema = z.infer<typeof tableCalcsSchema>;

function convertTableCalcSchemaToTableCalc(
    tableCalc: TableCalcSchema,
): TableCalculation {
    const { type, name, displayName } = tableCalc;

    // Build the template
    const baseCalc: Omit<TableCalculation, 'format'> = {
        name,
        displayName,
        type: TableCalculationType.NUMBER,
    };

    switch (type) {
        case 'percent_change_from_previous':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                    fieldId: tableCalc.fieldId,
                    orderBy: tableCalc.orderBy ?? [],
                },
                format: {
                    type: CustomFormatType.PERCENT,
                    separator: NumberSeparator.DEFAULT,
                },
            };
        case 'percent_of_previous_value':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE,
                    fieldId: tableCalc.fieldId,
                    orderBy: tableCalc.orderBy ?? [],
                },
                format: {
                    type: CustomFormatType.PERCENT,
                    separator: NumberSeparator.DEFAULT,
                },
            };
        case 'percent_of_column_total':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                    fieldId: tableCalc.fieldId,
                    partitionBy: tableCalc.partitionBy ?? [],
                },
                format: {
                    type: CustomFormatType.PERCENT,
                    separator: NumberSeparator.DEFAULT,
                },
            };
        case 'rank_in_column':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.RANK_IN_COLUMN,
                    fieldId: tableCalc.fieldId,
                },
                format: {
                    type: CustomFormatType.NUMBER,
                    separator: NumberSeparator.DEFAULT,
                },
            };
        case 'running_total':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.RUNNING_TOTAL,
                    fieldId: tableCalc.fieldId,
                },
                format: {
                    type: CustomFormatType.NUMBER,
                    separator: NumberSeparator.DEFAULT,
                },
            };
        case 'window_function': {
            // Map string window function to enum
            const windowFunctionMap: Record<
                | 'row_number'
                | 'percent_rank'
                | 'sum'
                | 'avg'
                | 'count'
                | 'min'
                | 'max',
                WindowFunctionType
            > = {
                row_number: WindowFunctionType.ROW_NUMBER,
                percent_rank: WindowFunctionType.PERCENT_RANK,
                sum: WindowFunctionType.SUM,
                avg: WindowFunctionType.AVG,
                count: WindowFunctionType.COUNT,
                min: WindowFunctionType.MIN,
                max: WindowFunctionType.MAX,
            };

            const format =
                tableCalc.windowFunction === 'percent_rank'
                    ? {
                          type: CustomFormatType.PERCENT,
                          separator: NumberSeparator.DEFAULT,
                      }
                    : {
                          type: CustomFormatType.NUMBER,
                          separator: NumberSeparator.DEFAULT,
                      };

            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: windowFunctionMap[tableCalc.windowFunction],
                    fieldId: tableCalc.fieldId,
                    orderBy: tableCalc.orderBy ?? [],
                    partitionBy: tableCalc.partitionBy ?? [],
                },
                format,
            };
        }
        default:
            return assertUnreachable(type, 'Unknown table calc type');
    }
}

export function convertAiTableCalcsSchemaToTableCalcs(
    tableCalcs: TableCalcsSchema,
): TableCalculation[] {
    return tableCalcs?.map((tc) => convertTableCalcSchemaToTableCalc(tc)) ?? [];
}
