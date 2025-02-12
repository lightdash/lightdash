import groupBy from 'lodash/groupBy';
import { type AnyType } from '../types/any';
import {
    type DbtColumnLightdashMetric,
    type DbtModelColumn,
    type DbtModelNode,
} from '../types/dbt';
import { friendlyName } from '../types/field';
import { convertMetricFilterToDbt } from '../types/filterGrammarConversion';
import { type AdditionalMetric } from '../types/metricQuery';
import { getFormatExpression } from './formatting';

export function convertCustomMetricToDbt(
    field: AdditionalMetric,
): DbtColumnLightdashMetric {
    const filters = convertMetricFilterToDbt(field.filters);
    return {
        label: field.label || friendlyName(field.name),
        description: field.description,
        type: field.type,
        format: getFormatExpression(field),
        percentile: field.percentile,
        filters,
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
        }) as AnyType,
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
