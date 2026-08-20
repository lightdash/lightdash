import { z } from 'zod';
import {
    CustomFormatType,
    FrameBoundaryType,
    FrameType,
    NumberSeparator,
    TableCalculationTemplateType,
    TableCalculationType,
    type TableCalculation,
} from '../../../../types/field';
import assertUnreachable from '../../../../utils/assertUnreachable';
import {
    tableCalcFormulaSchema,
    withLeadingEquals,
    type TableCalcFormulaSchema,
} from './tableCalcFormula';
import { tableCalcPercentChangeFromPreviousSchema } from './tableCalcPercentChangeFromPrevious';
import { tableCalcPercentOfColumnTotalSchema } from './tableCalcPercentOfColumnTotal';
import { tableCalcPercentOfPreviousValueSchema } from './tableCalcPercentOfPreviousValue';
import { tableCalcRankInColumnSchema } from './tableCalcRankInColumn';
import { tableCalcRunningTotalSchema } from './tableCalcRunningTotal';
import { tableCalcWindowFunctionSchema } from './tableCalcWindowFunction';

// Wide union: `formula` plus the legacy template types. Kept for parsing
// persisted tool args from old threads; new agent contracts advertise
// formulaTableCalcsSchema only.
const tableCalcSchema = z.discriminatedUnion('type', [
    tableCalcFormulaSchema,
    tableCalcPercentChangeFromPreviousSchema,
    tableCalcPercentOfPreviousValueSchema,
    tableCalcPercentOfColumnTotalSchema,
    tableCalcRankInColumnSchema,
    tableCalcRunningTotalSchema,
    tableCalcWindowFunctionSchema,
]);

export type TableCalcSchema = z.infer<typeof tableCalcSchema>;
export const tableCalcsSchema = z.array(tableCalcSchema).nullable().describe(`
Table calculations perform row-by-row calculations on query results without collapsing rows. Similar to SQL window functions.

**Prefer type "formula"** — it expresses arithmetic across fields, ratios, comparisons, conditionals, and partitioned window calculations. The other types are legacy single-field templates kept for backwards compatibility.

**Technical Requirements:**
- Appear as additional columns in query results
- Can be used in sorts and filters alongside dimensions/metrics
- Multiple calculations can be combined in a single query
- All fields referenced must exist in the query (dimensions, metrics, or other table calculations)
`);

export type TableCalcsSchema = z.infer<typeof tableCalcsSchema>;

// Formula-only contract advertised to the agent. The wide tableCalcsSchema
// above still parses everything this produces.
export const formulaTableCalcsSchema = z
    .array(tableCalcFormulaSchema)
    .nullable().describe(`
Table calculations perform row-by-row calculations on query results without collapsing rows, using spreadsheet-like formulas.

Use them whenever the question needs math the metric query alone can't express: arithmetic across metrics (\`metric_a + metric_b\`), ratios, percent of total, period-over-period change, running totals, moving averages, ranking, row-level comparisons, or aggregating already-aggregated metrics.

**Technical Requirements:**
- Appear as additional columns in query results
- Can be used in sorts and filters alongside dimensions/metrics
- Multiple calculations can be combined in a single query; a formula can reference another table calculation by name
- All fields referenced must be selected in the query (dimensions, metrics, custom metrics, or other table calculations)
`);

export type FormulaTableCalcsSchema = z.infer<typeof formulaTableCalcsSchema>;

function frameBoundaryStringToEnum(
    boundaryType:
        | 'unbounded_preceding'
        | 'preceding'
        | 'current_row'
        | 'following'
        | 'unbounded_following',
): FrameBoundaryType {
    switch (boundaryType) {
        case 'unbounded_preceding':
            return FrameBoundaryType.UNBOUNDED_PRECEDING;
        case 'preceding':
            return FrameBoundaryType.PRECEDING;
        case 'current_row':
            return FrameBoundaryType.CURRENT_ROW;
        case 'following':
            return FrameBoundaryType.FOLLOWING;
        case 'unbounded_following':
            return FrameBoundaryType.UNBOUNDED_FOLLOWING;
        default:
            return assertUnreachable(boundaryType, 'Unknown boundary type');
    }
}

function formulaFormatToCustomFormatType(
    format: TableCalcFormulaSchema['format'],
): CustomFormatType {
    switch (format) {
        case 'percent':
            return CustomFormatType.PERCENT;
        case 'number':
        case null:
            return CustomFormatType.NUMBER;
        default:
            return assertUnreachable(format, 'Unknown formula format');
    }
}

function formulaResultTypeToTableCalculationType(
    resultType: TableCalcFormulaSchema['resultType'],
): TableCalculationType {
    switch (resultType) {
        case 'string':
            return TableCalculationType.STRING;
        case 'date':
            return TableCalculationType.DATE;
        case 'timestamp':
            return TableCalculationType.TIMESTAMP;
        case 'boolean':
            return TableCalculationType.BOOLEAN;
        case 'number':
        case null:
            return TableCalculationType.NUMBER;
        default:
            return assertUnreachable(resultType, 'Unknown formula result type');
    }
}

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
        case 'formula': {
            const resultType = formulaResultTypeToTableCalculationType(
                tableCalc.resultType,
            );
            return {
                ...baseCalc,
                type: resultType,
                // Persisted formulas carry the leading '=' the grammar requires
                formula: withLeadingEquals(tableCalc.formula),
                // Numeric display formats don't apply to non-numeric results
                ...(resultType === TableCalculationType.NUMBER
                    ? {
                          format: {
                              type: formulaFormatToCustomFormatType(
                                  tableCalc.format,
                              ),
                              separator: NumberSeparator.DEFAULT,
                          },
                      }
                    : {}),
            };
        }
        case 'percent_change_from_previous':
            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                    fieldId: tableCalc.fieldId,
                    orderBy: tableCalc.orderBy ?? [],
                    partitionBy: tableCalc.partitionBy ?? [],
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
                    partitionBy: tableCalc.partitionBy ?? [],
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
            const format =
                tableCalc.windowFunction === 'percent_rank' ||
                tableCalc.windowFunction === 'cume_dist'
                    ? {
                          type: CustomFormatType.PERCENT,
                          separator: NumberSeparator.DEFAULT,
                      }
                    : {
                          type: CustomFormatType.NUMBER,
                          separator: NumberSeparator.DEFAULT,
                      };

            // Convert frame clause string literals to enum types
            const frame = tableCalc.frame
                ? {
                      frameType:
                          tableCalc.frame.frameType === 'rows'
                              ? FrameType.ROWS
                              : FrameType.RANGE,
                      start: tableCalc.frame.start
                          ? {
                                type: frameBoundaryStringToEnum(
                                    tableCalc.frame.start.type,
                                ),
                                offset:
                                    tableCalc.frame.start.offset ?? undefined,
                            }
                          : undefined,
                      end: {
                          type: frameBoundaryStringToEnum(
                              tableCalc.frame.end.type,
                          ),
                          offset: tableCalc.frame.end.offset ?? undefined,
                      },
                  }
                : undefined;

            return {
                ...baseCalc,
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: tableCalc.windowFunction,
                    fieldId: tableCalc.fieldId,
                    orderBy: tableCalc.orderBy ?? [],
                    partitionBy: tableCalc.partitionBy ?? [],
                    frame,
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
