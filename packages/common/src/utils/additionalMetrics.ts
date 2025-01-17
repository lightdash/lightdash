import { convertColumnMetric } from '../types/dbt';
import { type CompiledTable } from '../types/explore';
import { type Metric } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { type AdditionalMetric } from '../types/metricQuery';

type ConvertAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    table: CompiledTable;
};

export const convertAdditionalMetric = ({
    additionalMetric,
    table,
}: ConvertAdditionalMetricArgs): Metric => {
    const metric = convertColumnMetric({
        modelName: table.name,
        dimensionSql: additionalMetric.sql,
        name: additionalMetric.name,
        metric: { ...additionalMetric, filters: undefined },
        tableLabel: table.label,
        // Additional metrics are not cataloged, so this is irrelevant
        spotlightConfig: DEFAULT_SPOTLIGHT_CONFIG,
    });

    return {
        ...metric,
        ...(additionalMetric.filters && {
            filters: additionalMetric.filters,
        }),
        ...(additionalMetric.formatOptions && {
            formatOptions: additionalMetric.formatOptions,
        }),
    };
};
