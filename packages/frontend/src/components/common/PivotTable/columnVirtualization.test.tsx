import {
    convertSqlPivotedRowsToPivotData,
    VizAggregationOptions,
    VizIndexType,
    type ResultRow,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PivotTable from '.';
import { renderWithProviders } from '../../../testing/testUtils';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
    'keeps merged headers, frozen row spans and totals aligned while scrolling with metricsAsRows=%s',
    async (metricsAsRows) => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            200,
        );
        const valuesColumns = Array.from({ length: 80 }, (_, index) => ({
            referenceField: 'sales',
            aggregation: VizAggregationOptions.ANY,
            pivotColumnName: `sales_${index}`,
            pivotValues: [
                { referenceField: 'year', value: '2026' },
                { referenceField: 'week', value: `week ${index}` },
            ],
        }));
        const row: ResultRow = {
            region: { value: { raw: 'West', formatted: 'West' } },
            ...Object.fromEntries(
                valuesColumns.map(({ pivotColumnName }, index) => [
                    pivotColumnName,
                    { value: { raw: index, formatted: String(index) } },
                ]),
            ),
        };
        const getField = () => undefined;
        const getFieldLabel = (id: string) => id;
        const data = convertSqlPivotedRowsToPivotData({
            rows: ['Oakland', 'Portland'].map((city) => ({
                ...row,
                city: { value: { raw: city, formatted: city } },
            })),
            pivotDetails: {
                indexColumn: [
                    { type: VizIndexType.CATEGORY, reference: 'region' },
                    { type: VizIndexType.CATEGORY, reference: 'city' },
                ],
                groupByColumns: [{ reference: 'year' }, { reference: 'week' }],
                valuesColumns,
                sortBy: [],
                originalColumns: {},
                totalColumnCount: 80,
            },
            pivotConfig: {
                metricsAsRows,
                columnTotals: true,
                rowTotals: true,
            },
            warehouseColumnTotals: Object.fromEntries(
                valuesColumns.map(({ pivotColumnName }, index) => [
                    pivotColumnName,
                    100 + index,
                ]),
            ),
            warehouseGrandTotals: { sales: 888 },
            groupedSubtotals: undefined,
            getField,
            getFieldLabel,
        });
        renderWithProviders(
            <PivotTable
                data={data}
                conditionalFormattings={[]}
                minMaxMap={{}}
                getField={getField}
                getFieldLabel={getFieldLabel}
                hideRowNumbers={false}
                isMinimal={false}
                showRowGrouping
                enableContextMenu={false}
                columnProperties={{ region: { frozen: true } }}
            />,
        );
        const table = screen.getByRole('table') as HTMLTableElement;
        const body = within(table.tBodies[0].querySelector('tr')!);
        const footer = within(table.tFoot!);
        expect(await body.findByText('0')).toBeInTheDocument();
        expect(table).toHaveAttribute(
            'aria-colcount',
            metricsAsRows ? '85' : '84',
        );
        expect(screen.queryByText('week 79')).toBeNull();
        expect(screen.getByText('2026').closest('th')!.colSpan).toBeLessThan(
            80,
        );
        expect(footer.getByText('100')).toBeInTheDocument();
        fireEvent.scroll(table.parentElement!, {
            target: { scrollLeft: metricsAsRows ? 8030 : 7930 },
        });
        await waitFor(() => expect(body.getByText('79')).toBeInTheDocument());
        expect(screen.queryByText('week 0')).toBeNull();
        expect(screen.getByText('week 79')).toBeInTheDocument();
        expect(body.getByText('79').closest('td')).toHaveAttribute(
            'aria-colindex',
            metricsAsRows ? '84' : '83',
        );
        expect(screen.getByText('2026')).toBeInTheDocument();
        expect(body.getByText('West').closest('td')).toHaveAttribute(
            'rowspan',
            '2',
        );
        expect(footer.getByText('179')).toBeInTheDocument();
        expect(footer.getByText('888')).toBeInTheDocument();
    },
);
