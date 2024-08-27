import { type VizTableConfig, type VizTableOptions } from './types';
import { type IChartDataModel } from './types/IChartDataModel';
import type { IResultsRunner } from './types/IResultsRunner';

export class TableDataModel<TPivotChartLayout>
    implements IChartDataModel<VizTableOptions>
{
    private readonly resultsRunner: IResultsRunner<TPivotChartLayout>;

    constructor(args: { resultsRunner: IResultsRunner<TPivotChartLayout> }) {
        this.resultsRunner = args.resultsRunner;
    }

    private getColumns() {
        return this.resultsRunner.getColumns();
    }

    public getVisibleColumns() {
        // ! TODO: implement
        // return this.getColumns().filter((column) =>
        //     this.config ? this.config.columns[column]?.visible : true,
        // );

        return this.getColumns();
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
                    visible: true, // FIXME: should this be true all the time?
                    reference: key,
                    label: key,
                    frozen: true,
                    order: undefined,
                },
            }),
            {},
        );

        return { defaultColumnConfig: columns };
    }
}
