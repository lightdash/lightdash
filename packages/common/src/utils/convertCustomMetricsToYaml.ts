import type { DbtColumnLightdashMetric } from '../types/dbt';
import { friendlyName } from '../types/field';
import { convertMetricFilterToDbt } from '../types/filterGrammarConversion';
import { type AdditionalMetric } from '../types/metricQuery';
import { hasMeaningfulFormat } from './fields';
import { getFormatExpression } from './formatting';

export function convertCustomMetricToDbt(
    field: AdditionalMetric,
): DbtColumnLightdashMetric {
    const filters = convertMetricFilterToDbt(field.filters);
    // Only emit `format` when the chart has actually configured one. Calling
    // `getFormatExpression` on a numeric field with no formatOptions falls
    // through to a legacy NUMBER expression like `"#,##0.###"`, which would
    // otherwise be baked into the dbt YAML and fail downstream
    // `compareMetricAndCustomMetric` matching against an explore metric that
    // has no format set.
    const format = hasMeaningfulFormat(field)
        ? getFormatExpression(field)
        : undefined;
    return {
        label: field.label || friendlyName(field.name),
        description: field.description,
        type: field.type,
        format,
        percentile: field.percentile,
        filters,
    };
}
