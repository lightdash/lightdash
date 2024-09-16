import { type ChartKind } from '../types/savedCharts';
import {
    type PivotChartData,
    type VizPieChartConfig,
    type VizPieChartDisplay,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

export class PieChartDataModel<TLayout> {
    private readonly resultsRunner: IResultsRunner<TLayout>;

    constructor(args: { resultsRunner: IResultsRunner<TLayout> }) {
        this.resultsRunner = args.resultsRunner;
    }

    mergeConfig(
        chartKind: ChartKind.PIE,
        fieldConfig: TLayout,
        display: VizPieChartDisplay | undefined,
    ): VizPieChartConfig {
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: this.resultsRunner.mergePivotChartLayout(fieldConfig),
            display,
        };
    }

    getResultOptions() {
        const { indexLayoutOptions, valuesLayoutOptions } =
            this.resultsRunner.pivotChartOptions();

        return {
            groupFieldOptions: indexLayoutOptions,
            metricFieldOptions: valuesLayoutOptions,
        };
    }

    async getTransformedData(
        layout: TLayout | undefined,
        sql?: string,
        projectUuid?: string,
        limit?: number,
    ): Promise<PivotChartData | undefined> {
        if (!layout) {
            return undefined;
        }
        return this.resultsRunner.getPivotedVisualizationData(
            layout,
            sql,
            projectUuid,
            limit,
        );
    }

    getEchartsSpec(
        transformedData: Awaited<ReturnType<typeof this.getTransformedData>>,
        display: VizPieChartDisplay | undefined,
    ) {
        if (!transformedData) {
            return {};
        }

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
                    data: transformedData.results.map((result) => ({
                        name: transformedData.indexColumn?.reference
                            ? result[transformedData.indexColumn.reference]
                            : '-',
                        groupId: transformedData.indexColumn?.reference,
                        value: result[transformedData.valuesColumns[0]],
                    })),
                },
            ],
        };
    }
}
