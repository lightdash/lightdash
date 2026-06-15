import { TableDataModel } from './TableDataModel';
import { type IResultsRunner } from './types/IResultsRunner';

const resultsRunner: IResultsRunner = {
    getColumnNames: () => ['payment_method', 'total_amount'],
    getRows: () => [
        {
            payment_method: 'credit_card',
            total_amount: 100,
        },
    ],
    getPivotedVisualizationData: async () => ({
        queryUuid: undefined,
        columns: [],
        fileUrl: '',
        indexColumn: undefined,
        results: [],
        valuesColumns: [],
        columnCount: undefined,
    }),
    getPivotQueryDimensions: () => [],
    getPivotQueryMetrics: () => [],
    getPivotQueryCustomMetrics: () => [],
};

describe('TableDataModel', () => {
    it('shows result columns when column config is undefined', () => {
        const model = new TableDataModel({ resultsRunner });

        expect(model.getVisibleColumns()).toEqual([
            'payment_method',
            'total_amount',
        ]);
    });

    it('shows result columns when saved column config is empty', () => {
        const model = new TableDataModel({
            resultsRunner,
            columnsConfig: {},
        });

        expect(model.getVisibleColumns()).toEqual([
            'payment_method',
            'total_amount',
        ]);
    });

    it('respects explicit hidden columns', () => {
        const model = new TableDataModel({
            resultsRunner,
            columnsConfig: {
                payment_method: {
                    reference: 'payment_method',
                    label: 'Payment method',
                    visible: true,
                    frozen: false,
                },
                total_amount: {
                    reference: 'total_amount',
                    label: 'Total amount',
                    visible: false,
                    frozen: false,
                },
            },
        });

        expect(model.getVisibleColumns()).toEqual(['payment_method']);
    });
});
