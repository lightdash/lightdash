import { ChartKind } from '../types/savedCharts';
import { type ResultsRunnerBase } from './ResultsRunnerBase';
import {
    type PivotChartData,
    type VizPieChartDisplay,
    type VizPieChartOptions,
} from './types';
import { type IChartDataModel } from './types/IChartDataModel';

type PieChartConfig<TPivotChartLayout> = {
    metadata: {
        version: number;
    };
    type: ChartKind.PIE;
    fieldConfig: TPivotChartLayout | undefined;
    display: VizPieChartDisplay | undefined;
};

export class PieChartDataModel<TPivotChartLayout>
    implements IChartDataModel<VizPieChartOptions>
{
    private readonly resultsRunner: ResultsRunnerBase<TPivotChartLayout>;

    constructor(args: { resultsRunner: ResultsRunnerBase<TPivotChartLayout> }) {
        this.resultsRunner = args.resultsRunner;
    }

    mergeConfig(
        existingConfig?: PieChartConfig<TPivotChartLayout>,
    ): PieChartConfig<TPivotChartLayout> {
        return {
            metadata: {
                version: 1,
            },
            type: ChartKind.PIE as ChartKind.PIE, // without this cast, TS will complain
            fieldConfig: this.resultsRunner.mergePivotChartLayout(
                existingConfig?.fieldConfig,
            ),
            display: existingConfig?.display,
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
        layout: TPivotChartLayout | undefined,
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
