import groupBy from 'lodash/groupBy';
import type { DbtColumnLightdashMetric } from '../types/dbt';
import { friendlyName } from '../types/field';
import { convertMetricFilterToDbt } from '../types/filterGrammarConversion';
import { type AdditionalMetric } from '../types/metricQuery';
import type { YamlColumn, YamlModel } from '../types/yamlSchema';
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
    columnNode: YamlColumn,
    customMetricsToAdd: AdditionalMetric[],
): YamlColumn {
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
    modelNode: YamlModel,
    customMetricsToAdd: AdditionalMetric[],
): YamlModel {
    const groupedMetricsByDimension = groupBy(
        customMetricsToAdd,
        (metric) => metric.baseDimensionName,
    );

    return {
        ...modelNode,
        columns: Object.values(modelNode.columns || {}).map((columnNode) => {
            if (groupedMetricsByDimension[columnNode.name]) {
                return updateColumnNode(
                    columnNode,
                    groupedMetricsByDimension[columnNode.name],
                );
            }
            return columnNode;
        }),
    };
}

export function insertCustomMetricsInModelNodes(
    modelNodes: YamlModel[],
    customMetricsToAdd: AdditionalMetric[],
): YamlModel[] {
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
