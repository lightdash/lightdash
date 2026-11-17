import {
    PersistentDownloadFileAccessMode,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { PivotTableService } from './PivotTableService';

describe('PivotTableService.downloadPivotTableCsv', () => {
    it('writes raw boolean pivot and cell values as true and false', async () => {
        const service = new PivotTableService(
            {} as ConstructorParameters<typeof PivotTableService>[0],
        );
        const downloadCsvFile = vi.fn().mockResolvedValue({
            filename: 'f',
            path: 'p',
            localPath: 'p',
            truncated: false,
        });
        Object.assign(service, { downloadCsvFile });

        await service.downloadPivotTableCsv({
            projectUuid: 'project-1',
            rows: [
                {
                    orders_is_returned: false,
                    orders_total_order_amount_any_false: null,
                    orders_total_order_amount_any_true: 2397,
                },
            ],
            itemMap: {},
            pivotConfig: {
                pivotDimensions: ['orders_is_completed'],
                metricsAsRows: false,
                columnOrder: [],
            },
            pivotDetails: {
                totalColumnCount: 3,
                indexColumn: [
                    {
                        reference: 'orders_is_returned',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [false, true].map((value, index) => ({
                    referenceField: 'orders_total_order_amount',
                    pivotColumnName: `orders_total_order_amount_any_${value}`,
                    aggregation: VizAggregationOptions.ANY,
                    columnIndex: index + 1,
                    pivotValues: [
                        {
                            referenceField: 'orders_is_completed',
                            value,
                            formatted: String(value),
                        },
                    ],
                })),
                groupByColumns: [{ reference: 'orders_is_completed' }],
                sortBy: undefined,
                originalColumns: {},
            },
            exploreId: 'orders',
            onlyRaw: true,
            truncated: false,
            customLabels: undefined,
            organizationUuid: 'org-1',
            createdByUserUuid: 'user-1',
            accessMode: PersistentDownloadFileAccessMode.SIGNED,
        });

        const { csvContent } = downloadCsvFile.mock.calls[0][0];
        const [pivotHeader, , dataRow] = csvContent.split('\n');
        expect(pivotHeader).toBe('"orders_is_completed","false","true"');
        expect(dataRow).toBe('"false",,"2397"');
    });
});
