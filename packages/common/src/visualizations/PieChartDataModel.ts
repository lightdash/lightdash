import { type ChartKind } from '../types/savedCharts';
import {
    type PivotChartData,
    type VizPieChartConfig,
    type VizPieChartDisplay,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

export class PieChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    constructor(args: { resultsRunner: IResultsRunner }) {
        this.resultsRunner = args.resultsRunner;
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const dimensions = this.resultsRunner.getDimensions();
        const metrics = this.resultsRunner.getMetrics();

        console.log('dimensions', dimensions);
        console.log('metrics', metrics);

        // TODO: this could have its own type so it doesnt reference x and y
        return {
            x: {
                reference: dimensions[0].reference,
                type: dimensions[0].type,
            },
            y: metrics,
            groupBy: [],
        };
    }

    mergeConfig(
        chartKind: ChartKind.PIE,
        fieldConfig: PivotChartLayout,
        display: VizPieChartDisplay | undefined,
    ): VizPieChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const mergedLayout =
            newDefaultLayout?.x?.reference === fieldConfig?.x?.reference
                ? fieldConfig
                : newDefaultLayout;

        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout,
            display,
        };
    }

    getResultOptions() {
        return {
            groupFieldOptions: this.resultsRunner.getDimensions(),
            metricFieldOptions: this.resultsRunner.getMetrics(),
        };
    }

    async getTransformedData(
        layout: PivotChartLayout | undefined,
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
