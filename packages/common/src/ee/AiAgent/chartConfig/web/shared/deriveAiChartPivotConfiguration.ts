import { deriveDataAppVizPivotConfig } from '../../../../../pivot/deriveDataAppVizPivotConfig';
import { derivePivotConfigurationFromChart } from '../../../../../pivot/derivePivotConfigFromChart';
import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { type PivotConfiguration } from '../../../../../types/pivot';
import {
    ChartType,
    type DataAppVizChart,
} from '../../../../../types/savedCharts';
import assertUnreachable from '../../../../../utils/assertUnreachable';
import { type DataAppVizField } from '../../../../apps/types';
import {
    isCustomChartTypeSlugChartConfig,
    type ToolRunQueryArgsTransformed,
} from '../../../schemas';
import { getRunQueryChartConfig } from '../runQueryTool/getRunQueryChartConfig';

export type AiChartPivotSource =
    | { type: 'builtin'; queryTool: ToolRunQueryArgsTransformed }
    | {
          type: 'customChartType';
          chart: DataAppVizChart;
          schemaFields: DataAppVizField[];
      };

/** The warehouse pivot an AI chart needs, or undefined for unpivoted results. */
export const deriveAiChartPivotConfiguration = ({
    source,
    metricQuery,
    fieldsMap,
}: {
    source: AiChartPivotSource;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
}): PivotConfiguration | undefined => {
    switch (source.type) {
        case 'builtin': {
            const { queryTool } = source;
            const { chartConfig } = queryTool;
            if (isCustomChartTypeSlugChartConfig(chartConfig)) return undefined;
            const groupBy = chartConfig?.groupBy;
            if (!groupBy?.length) return undefined;
            return derivePivotConfigurationFromChart(
                {
                    chartConfig: getRunQueryChartConfig({
                        queryTool,
                        metricQuery,
                        fieldsMap,
                    }),
                    pivotConfig: { columns: groupBy },
                },
                metricQuery,
                fieldsMap,
            );
        }
        case 'customChartType':
            return derivePivotConfigurationFromChart(
                {
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: source.chart,
                    },
                    pivotConfig: deriveDataAppVizPivotConfig(
                        source.schemaFields,
                        source.chart.fieldMapping,
                    ),
                },
                metricQuery,
                fieldsMap,
            );
        default:
            return assertUnreachable(source, 'Unknown AI chart pivot source');
    }
};
