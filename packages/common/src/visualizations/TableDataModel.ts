import { type ChartKind } from '../types/savedCharts';
import {
    type VizChartLayout,
    type VizTableConfig,
    type VizTableOptions,
} from './types';
import { type IChartDataModel } from './types/IChartDataModel';
import type { IResultsRunner } from './types/IResultsRunner';

export class TableDataModel
    implements
        IChartDataModel<
            VizTableOptions,
            VizTableConfig,
            undefined,
            ChartKind.TABLE
        >
{
    private readonly resultsRunner: IResultsRunner<VizChartLayout>;

    private readonly config: VizTableConfig | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner<VizChartLayout>;
        config: VizTableConfig | undefined;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.config = args.config;
    }

    private getColumns() {
        return this.resultsRunner.getColumns();
    }

    public getVisibleColumns() {
        return this.getColumns().filter((column) =>
            this.config ? this.config.columns[column]?.visible : true,
        );
    }

    public getRows() {
        return this.resultsRunner.getRows();
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }

    public getResultOptions() {
        const columns = this.getColumns().reduce<VizTableConfig['columns']>(
            (acc, key) => ({
                ...acc,
                [key]: {
                    visible: this.config?.columns[key]?.visible ?? true,
                    reference: key,
                    label: this.config?.columns[key]?.label ?? key,
                    frozen: this.config?.columns[key]?.frozen ?? false,
                    order: this.config?.columns[key]?.order,
                },
            }),
            {},
        );

        return { defaultColumnConfig: columns };
    }

    mergeConfig(chartKind: ChartKind.TABLE): VizTableConfig {
        return {
            type: chartKind,
            metadata: {
                version: 1,
            },
            columns: this.getResultOptions().defaultColumnConfig,
        };
    }
}
