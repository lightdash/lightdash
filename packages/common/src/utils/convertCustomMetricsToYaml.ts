import type { DbtColumnLightdashMetric } from '../types/dbt';
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
