import {
    getItemLabelWithoutTableName,
    getPivotValueColumnBaseName,
    ParseError,
    type ConditionalFormattingConfig,
    type ItemsMap,
    type PivotValuesColumn,
} from '@lightdash/common';
import { Readable } from 'stream';
import { splitJsonlStream } from './streamUtils';

type FlatPivotValuesColumn = PivotValuesColumn & {
    flatFieldId: string;
};

type FlatPivotExportOptions = {
    fields: ItemsMap;
    pivotValuesColumns: PivotValuesColumn[];
    columnOrder: string[];
    hiddenFields: string[];
    customLabels: Record<string, string>;
    conditionalFormattings?: ConditionalFormattingConfig[];
    columnTotals?: Record<string, number>;
};

const getValueColumnKey = (
    referenceField: string,
    aggregation: PivotValuesColumn['aggregation'],
) => `${referenceField}\0${aggregation}`;

const replaceFieldIds = (
    fieldIds: string[],
    flatFieldIdsByReference: Map<string, string[]>,
) =>
    fieldIds.flatMap(
        (fieldId) => flatFieldIdsByReference.get(fieldId) ?? fieldId,
    );

export const prepareFlatPivotExport = ({
    fields,
    pivotValuesColumns,
    columnOrder,
    hiddenFields,
    customLabels,
    conditionalFormattings,
    columnTotals,
}: FlatPivotExportOptions) => {
    const aggregationsByReference = new Map<
        string,
        PivotValuesColumn['aggregation'][]
    >();
    for (const { referenceField, aggregation } of pivotValuesColumns) {
        const aggregations = aggregationsByReference.get(referenceField) ?? [];
        if (!aggregations.includes(aggregation)) aggregations.push(aggregation);
        aggregationsByReference.set(referenceField, aggregations);
    }

    const reservedFieldIds = new Set(Object.keys(fields));
    const flatFieldIdByValueColumn = new Map<string, string>();
    const flatFieldIdByCanonicalId = new Map<string, string>();
    const flatFieldIdsByReference = new Map<string, string[]>();
    for (const [referenceField, aggregations] of aggregationsByReference) {
        const flatFieldIds = aggregations.map((aggregation) => {
            if (aggregations.length === 1) return referenceField;
            const baseFieldId = getPivotValueColumnBaseName(
                referenceField,
                aggregation,
            );
            let flatFieldId = baseFieldId;
            let suffix = 2;
            while (
                reservedFieldIds.has(flatFieldId) &&
                flatFieldId !== referenceField
            ) {
                flatFieldId = `${baseFieldId}_${suffix}`;
                suffix += 1;
            }
            reservedFieldIds.add(flatFieldId);
            return flatFieldId;
        });
        aggregations.forEach((aggregation, index) => {
            const canonicalFieldId = getPivotValueColumnBaseName(
                referenceField,
                aggregation,
            );
            flatFieldIdByValueColumn.set(
                getValueColumnKey(referenceField, aggregation),
                flatFieldIds[index],
            );
            flatFieldIdByCanonicalId.set(canonicalFieldId, flatFieldIds[index]);
        });
        flatFieldIdsByReference.set(referenceField, flatFieldIds);
    }

    const flatFields: ItemsMap = {};
    for (const [fieldId, field] of Object.entries(fields)) {
        const aggregations = aggregationsByReference.get(fieldId);
        if (!aggregations || aggregations.length === 1) {
            flatFields[fieldId] = field;
        } else {
            for (const aggregation of aggregations) {
                const flatFieldId = flatFieldIdByValueColumn.get(
                    getValueColumnKey(fieldId, aggregation),
                )!;
                flatFields[flatFieldId] = {
                    ...field,
                    label: `${getItemLabelWithoutTableName(field)} (${aggregation.toUpperCase()})`,
                };
            }
        }
    }

    const flatCustomLabels = { ...customLabels };
    for (const [referenceField, aggregations] of aggregationsByReference) {
        const customLabel = flatCustomLabels[referenceField];
        if (aggregations.length > 1 && customLabel !== undefined) {
            delete flatCustomLabels[referenceField];
            for (const aggregation of aggregations) {
                const flatFieldId = flatFieldIdByValueColumn.get(
                    getValueColumnKey(referenceField, aggregation),
                )!;
                flatCustomLabels[flatFieldId] =
                    `${customLabel} (${aggregation.toUpperCase()})`;
            }
        }
    }

    const remapConditionalTarget = (
        fieldId: string,
        aggregation: PivotValuesColumn['aggregation'],
    ) =>
        flatFieldIdByValueColumn.get(getValueColumnKey(fieldId, aggregation)) ??
        fieldId;
    const flatConditionalFormattings = conditionalFormattings?.flatMap(
        (config) => {
            const targetFieldId = config.target?.fieldId;
            const targetAggregations = targetFieldId
                ? aggregationsByReference.get(targetFieldId)
                : undefined;
            if (!targetFieldId || !targetAggregations?.length) return config;
            return targetAggregations.map((aggregation) => ({
                ...config,
                target: {
                    fieldId: remapConditionalTarget(targetFieldId, aggregation),
                },
                ...('rules' in config
                    ? {
                          rules: config.rules.map((rule) =>
                              'compareTarget' in rule && rule.compareTarget
                                  ? {
                                        ...rule,
                                        compareTarget: {
                                            fieldId: remapConditionalTarget(
                                                rule.compareTarget.fieldId,
                                                aggregation,
                                            ),
                                        },
                                    }
                                  : rule,
                          ),
                      }
                    : {}),
            }));
        },
    );

    const flatColumnTotals = columnTotals
        ? Object.fromEntries(
              Object.entries(columnTotals).flatMap(([fieldId, value]) => {
                  const flatCanonicalFieldId =
                      flatFieldIdByCanonicalId.get(fieldId);
                  if (flatCanonicalFieldId) {
                      return [[flatCanonicalFieldId, value]];
                  }
                  const flatFieldIds = flatFieldIdsByReference.get(fieldId);
                  return flatFieldIds?.length === 1
                      ? [[flatFieldIds[0], value]]
                      : [[fieldId, value]];
              }),
          )
        : undefined;

    return {
        fields: flatFields,
        pivotValuesColumns: pivotValuesColumns.map((column) => ({
            ...column,
            flatFieldId: flatFieldIdByValueColumn.get(
                getValueColumnKey(column.referenceField, column.aggregation),
            )!,
        })),
        columnOrder: replaceFieldIds(columnOrder, flatFieldIdsByReference),
        hiddenFields: replaceFieldIds(hiddenFields, flatFieldIdsByReference),
        customLabels: flatCustomLabels,
        conditionalFormattings: flatConditionalFormattings,
        columnTotals: flatColumnTotals,
    };
};

export const unpivotResultsStream = (
    stream: Readable,
    valuesColumns: FlatPivotValuesColumn[],
): Readable => {
    const groups = new Map<string, FlatPivotValuesColumn[]>();
    const pivotColumnNames = new Set(
        valuesColumns.map((column) => column.pivotColumnName),
    );
    for (const column of valuesColumns) {
        const key = JSON.stringify(
            column.pivotValues.map(({ referenceField, value }) => [
                referenceField,
                value,
            ]),
        );
        const group = groups.get(key) ?? [];
        group.push(column);
        groups.set(key, group);
    }

    return Readable.from(
        (async function* unpivotRows() {
            for await (const line of splitJsonlStream(stream)) {
                if (line.trim()) {
                    let row: Record<string, unknown>;
                    try {
                        row = JSON.parse(line) as Record<string, unknown>;
                    } catch {
                        stream.destroy();
                        throw new ParseError(
                            'Failed to parse pivot results for flat export',
                        );
                    }
                    const dimensions = Object.fromEntries(
                        Object.entries(row).filter(
                            ([key]) => !pivotColumnNames.has(key),
                        ),
                    );
                    for (const group of groups.values()) {
                        if (
                            group.some((column) =>
                                Object.hasOwn(row, column.pivotColumnName),
                            )
                        ) {
                            const flatRow: Record<string, unknown> = {
                                ...dimensions,
                            };
                            for (const { referenceField, value } of group[0]
                                .pivotValues) {
                                flatRow[referenceField] = value;
                            }
                            for (const column of group) {
                                if (
                                    Object.hasOwn(row, column.pivotColumnName)
                                ) {
                                    flatRow[column.flatFieldId] =
                                        row[column.pivotColumnName];
                                }
                            }
                            yield `${JSON.stringify(flatRow)}\n`;
                        }
                    }
                }
            }
        })(),
    );
};
