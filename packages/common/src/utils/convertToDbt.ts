import groupBy from 'lodash/groupBy';
import {
    type DbtColumnLightdashMetric,
    type DbtModelColumn,
    type DbtModelNode,
} from '../types/dbt';
import {
    CustomFormatType,
    Format,
    friendlyName,
    type CustomFormat,
} from '../types/field';
import { type AdditionalMetric } from '../types/metricQuery';

function convertFormatOptionsToFormat(
    formatOptions?: CustomFormat,
): Format | undefined {
    if (formatOptions?.type === CustomFormatType.PERCENT) {
        return Format.PERCENT;
    }
    if (formatOptions?.type === CustomFormatType.ID) {
        return Format.PERCENT;
    }
    if (
        formatOptions?.type === CustomFormatType.CURRENCY &&
        formatOptions?.currency
    ) {
        switch (formatOptions.currency) {
            case 'USD':
                return Format.USD;
            case 'GBP':
                return Format.GBP;
            case 'EUR':
                return Format.EUR;
            default:
                break;
        }
    }
    return undefined;
}

// Note that we do not support all the formatting configuration in YML yet
export function convertCustomMetricToDbt(
    field: AdditionalMetric,
): DbtColumnLightdashMetric {
    return {
        label: field.label || friendlyName(field.name),
        description: field.description,
        type: field.type,
        round: field.round || field.formatOptions?.round,
        format:
            field.format || convertFormatOptionsToFormat(field.formatOptions),
        compact: field.compact || field.formatOptions?.compact,
        percentile: field.percentile,
        // todo: filters?: MetricFilterRule[];
    };
}

function updateColumnNode(
    columnNode: DbtModelColumn,
    customMetricsToAdd: AdditionalMetric[],
): DbtModelColumn {
    return {
        ...columnNode,
        meta: {
            ...columnNode.meta,
            metrics: {
                ...(columnNode.meta?.metrics || {}),
                ...Object.fromEntries(
                    customMetricsToAdd.map((customMetric) => [
                        customMetric.name,
                        convertCustomMetricToDbt(customMetric),
                    ]),
                ),
            },
        },
    };
}

function updateModelNode(
    modelNode: DbtModelNode,
    customMetricsToAdd: AdditionalMetric[],
): DbtModelNode {
    const groupedMetricsByDimension = groupBy(
        customMetricsToAdd,
        (metric) => metric.baseDimensionName,
    );

    return {
        ...modelNode,
        columns: Object.values(modelNode.columns).map((columnNode) => {
            if (groupedMetricsByDimension[columnNode.name]) {
                return updateColumnNode(
                    columnNode,
                    groupedMetricsByDimension[columnNode.name],
                );
            }
            return columnNode;
        }) as any,
    };
}

export function findAndUpdateModelNodes(
    modelNodes: DbtModelNode[],
    customMetricsToAdd: AdditionalMetric[],
): DbtModelNode[] {
    const groupMetricsByTable = groupBy(
        customMetricsToAdd,
        (metric) => metric.table,
    );
    return modelNodes.map((modelNode) => {
        if (groupMetricsByTable[modelNode.name]) {
            return updateModelNode(
                modelNode,
                groupMetricsByTable[modelNode.name],
            );
        }
        return modelNode;
    });
}
