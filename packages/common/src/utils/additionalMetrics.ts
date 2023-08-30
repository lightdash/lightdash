import { convertColumnMetric } from '../types/dbt';
import { CompiledTable } from '../types/explore';
import { Metric } from '../types/field';
import { AdditionalMetric } from '../types/metricQuery';

type ConvertAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    table: CompiledTable;
};

export const convertAdditionalMetric = ({
    additionalMetric,
    table,
}: ConvertAdditionalMetricArgs): Metric => {
    // dimensions with date ends with caps: DAY, MONTH, YEAR
    // for example `order_date_DAY`, `order_date_MONTH`
    const baseDimension = additionalMetric.baseDimensionName
        ? Object.entries(table.dimensions).find(
              ([name]) =>
                  name.toLowerCase() === additionalMetric.baseDimensionName,
          )?.[1]
        : undefined;

    const metric = convertColumnMetric({
        modelName: table.name,
        dimensionSql: additionalMetric.sql,
        name: additionalMetric.name,
        metric: { ...additionalMetric, filters: undefined },
        tableLabel: table.label,
    });

    return {
        ...metric,
        ...(additionalMetric.filters && {
            filters: additionalMetric.filters,
        }),
        ...(baseDimension && {
            timeInterval: baseDimension.timeInterval,
        }),
    };
};
