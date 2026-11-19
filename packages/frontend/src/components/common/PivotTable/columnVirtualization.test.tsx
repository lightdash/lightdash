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
import { measureColumnWidth } from '../Table/measureColumnWidth';
import { PIVOT_CELL_PADDING } from './getPivotColumnWidths';

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
        const getFieldLabel = (id: string) =>
            id === 'week' ? 'Order fulfillment week of year' : id;
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
                    index === 0 ? 1234567890123 : 100 + index,
                ]),
            ),
            warehouseGrandTotals: { sales: 888 },
            groupedSubtotals: undefined,
            getField,
            getFieldLabel,
        });
        const saveWidth = vi.fn();
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
                renderSortMenu={() => null}
                onColumnWidthChange={saveWidth}
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
        const totalCell = footer.getByText('1,234,567,890,123').closest('th')!;
        const totalColumn = table.querySelector<HTMLTableColElement>(
            `col[data-column-index="${totalCell.getAttribute('aria-colindex')}"]`,
        );
        expect(
            Number(totalColumn!.style.width.match(/[\d.]+/)![0]),
        ).toBeGreaterThan(110);
        const weekTitle = within(table.tHead!).getByText(
            'Order fulfillment week of year',
        );
        const weekTitleIndex = weekTitle
            .closest('th,td')!
            .getAttribute('aria-colindex');
        const weekTitleColumn = table.querySelector<HTMLTableColElement>(
            `col[data-column-index="${weekTitleIndex}"]`,
        );
        expect(Number(weekTitleColumn!.style.width.match(/[\d.]+/)![0])).toBe(
            measureColumnWidth(
                'Order fulfillment week of year',
                [],
                0,
                PIVOT_CELL_PADDING,
            ),
        );
        const totalWidth = Array.from(table.querySelectorAll('col')).reduce(
            (sum, col) => sum + Number(col.style.width.match(/[\d.]+/)![0]),
            0,
        );
        fireEvent.scroll(table.parentElement!, {
            target: { scrollLeft: totalWidth - 400 },
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
        const header = within(table.tHead!).getByText('region').closest('th')!;
        const width = table.style.width;
        const minWidth = table.style.minWidth;
        vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(
            DOMRect.fromRect({ width: 8500 }),
        );
        vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(
            DOMRect.fromRect({ width: 100 }),
        );
        fireEvent.mouseDown(within(header).getByRole('separator'), {
            clientX: 100,
        });
        fireEvent.mouseMove(document, { clientX: 10 });
        expect(table.style.width).toBe('8450px');
        expect(table.style.minWidth).toBe('8450px');
        fireEvent.mouseUp(document, { clientX: 10 });
        expect(saveWidth).toHaveBeenCalledWith('region', 50);
        expect(table.style.width).toBe(width);
        expect(table.style.minWidth).toBe(minWidth);
    },
);
