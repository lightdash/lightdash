import {
    isPieChartSQLConfig,
    type SqlRunnerChartConfig,
} from '../types/sqlRunner';
import { type ResultsRunnerBase } from './ResultsRunnerBase';

export class PieChartDataTransformer<TBarChartLayout, TPieChartConfig> {
    private readonly transformer: ResultsRunnerBase<
        TBarChartLayout,
        TPieChartConfig
    >;

    constructor(args: {
        transformer: ResultsRunnerBase<TBarChartLayout, TPieChartConfig>;
    }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(config: SqlRunnerChartConfig) {
        if (!isPieChartSQLConfig(config)) {
            return {};
        }

        const { fieldConfig, display } = config;

        const transformedData = fieldConfig
            ? await this.transformer.getPieChartData(
                  fieldConfig as TPieChartConfig,
              )
            : undefined;

        return {
            legend: {
                show: true,
                orient: 'horizontal',
                type: 'scroll',
                left: 'center',
                top: 'top',
                align: 'auto',
            },
            tooltip: {
                trigger: 'item',
            },
            series: [
                {
                    type: 'pie',
                    radius: display?.isDonut ? ['30%', '70%'] : '50%',
                    center: ['50%', '50%'],
                    data: transformedData?.results.map((result) => ({
                        name: result[
                            fieldConfig?.groupFieldIds?.[0] || ''
                        ] as string,
                        groupId: fieldConfig?.groupFieldIds?.[0] || '',
                        value: result[fieldConfig?.metricId || ''] as number,
                    })),
                },
            ],
        };
    }
}
