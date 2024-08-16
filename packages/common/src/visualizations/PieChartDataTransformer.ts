import { ChartKind } from '../types/savedCharts';
import {
    type PivotChartData,
    type ResultsRunnerBase,
} from './ResultsRunnerBase';
import { type PieChartDisplay } from './SqlResultsRunner';

type PieChartConfig<TPivotChartLayout> = {
    metadata: {
        version: number;
    };
    type: ChartKind.PIE;
    fieldConfig: TPivotChartLayout | undefined;
    display: PieChartDisplay | undefined;
};

export class PieChartDataTransformer<TPivotChartLayout> {
    private readonly transformer: ResultsRunnerBase<TPivotChartLayout>;

    constructor(args: { transformer: ResultsRunnerBase<TPivotChartLayout> }) {
        this.transformer = args.transformer;
    }

    mergeConfig(
        existingConfig?: PieChartConfig<TPivotChartLayout>,
    ): PieChartConfig<TPivotChartLayout> {
        return {
            metadata: {
                version: 1,
            },
            type: ChartKind.PIE as ChartKind.PIE, // without this cast, TS will complain
            fieldConfig: this.transformer.mergePivotChartLayout(
                existingConfig?.fieldConfig,
            ),
            display: existingConfig?.display,
        };
    }

    async getTransformedData(
        layout: TPivotChartLayout | undefined,
    ): Promise<PivotChartData | undefined> {
        if (!layout) {
            return undefined;
        }
        return this.transformer.getPivotChartData(layout);
    }

    getEchartsSpec(
        transformedData: Awaited<ReturnType<typeof this.getTransformedData>>,
        display: PieChartDisplay | undefined,
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
