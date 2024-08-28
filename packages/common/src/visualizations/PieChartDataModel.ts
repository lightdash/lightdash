import { type ChartKind } from '../types/savedCharts';
import {
    type PivotChartData,
    type VizChartLayout,
    type VizPieChartConfig,
    type VizPieChartDisplay,
    type VizPieChartOptions,
} from './types';
import { type IChartDataModel } from './types/IChartDataModel';
import { type IResultsRunner } from './types/IResultsRunner';

export class PieChartDataModel
    implements
        IChartDataModel<VizPieChartOptions, VizPieChartConfig, ChartKind.PIE>
{
    private readonly resultsRunner: IResultsRunner<VizChartLayout>;

    constructor(args: { resultsRunner: IResultsRunner<VizChartLayout> }) {
        this.resultsRunner = args.resultsRunner;
    }

    mergeConfig(
        chartKind: ChartKind.PIE,
        currentConfig: VizPieChartConfig | undefined,
    ): VizPieChartConfig {
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: this.resultsRunner.mergePivotChartLayout(
                currentConfig?.fieldConfig,
            ),
            display: currentConfig?.display,
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
        layout: VizChartLayout | undefined,
        sql?: string,
        projectUuid?: string,
        limit?: number,
    ): Promise<PivotChartData | undefined> {
        if (!layout) {
            return undefined;
        }
        return this.resultsRunner.getPivotChartData(
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
                        name: result[transformedData.indexColumn.reference],
                        groupId: transformedData.indexColumn.reference,
                        value: result[transformedData.valuesColumns[0]],
                    })),
                },
            ],
        };
    }
}
