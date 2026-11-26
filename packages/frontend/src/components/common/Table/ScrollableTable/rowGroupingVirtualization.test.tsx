import {
    DimensionType,
    FieldType,
    type Dimension,
    type ResultRow,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScrollableTable from '.';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ROW_HEIGHT_PX } from '../constants';
import { TableProvider } from '../TableProvider';
import { type TableColumn } from '../types';

const ROW_COUNT = 1000;
const GROUP_SIZE = 100;

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
        function offsetHeight(this: HTMLElement) {
            return this.tagName === 'TR' ? ROW_HEIGHT_PX : 200;
        },
    );
});
afterEach(() => vi.restoreAllMocks());

const regionOf = (rowIndex: number) =>
    `Region ${Math.floor(rowIndex / GROUP_SIZE)}`;

const dimension = (name: string) =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        table: 't',
        name,
        label: name,
    }) as Dimension;

const column = (id: string, item?: Dimension): TableColumn => ({
    id,
    accessorFn: (data) => data[id],
    header: id,
    cell: (info) => info.getValue().value.formatted,
    meta: { width: 100, item },
});

const renderGroupedTable = () => {
    const rows: ResultRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
        region: { value: { raw: regionOf(index), formatted: regionOf(index) } },
        city: { value: { raw: `City ${index}`, formatted: `City ${index}` } },
        sales: { value: { raw: index, formatted: `Sales ${index}` } },
    }));
    const columns = [
        column('region', dimension('region')),
        column('city', dimension('city')),
        column('sales'),
    ];
    renderWithProviders(
        <TableProvider
            data={rows}
            columns={columns}
            columnOrder={['region', 'city', 'sales']}
            totalRowsCount={ROW_COUNT}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            hideRowNumbers
        >
            <ScrollableTable
                minimal={false}
                showRowGrouping
                showSubtotals={false}
            />
        </TableProvider>,
    );
    return screen.getByRole('table') as HTMLTableElement;
};

const getRenderedDataRows = (table: HTMLTableElement) =>
    Array.from(table.querySelectorAll('tbody tr')).flatMap((tr) => {
        const cityCell = Array.from(tr.querySelectorAll('td')).find((td) =>
            /^City \d+$/.test(td.textContent ?? ''),
        );
        if (!cityCell) return [];
        return [
            {
                tr,
                rowIndex: Number(cityCell.textContent!.replace('City ', '')),
            },
        ];
    });

// Every rendered row is covered by exactly one region cell, that cell shows
// the row's own region, and no rowSpan reaches past the last rendered row.
const expectRegionCellsCoverRenderedRows = (table: HTMLTableElement) => {
    const rows = getRenderedDataRows(table);
    let coveredRows = 0;
    rows.forEach(({ tr, rowIndex }) => {
        const regionCell = Array.from(tr.querySelectorAll('td')).find((td) =>
            /^Region \d+$/.test(td.textContent ?? ''),
        );
        if (coveredRows === 0) {
            expect(regionCell?.textContent).toBe(regionOf(rowIndex));
            coveredRows = Number(regionCell!.getAttribute('rowspan') ?? 1);
        } else {
            expect(regionCell).toBeUndefined();
        }
        coveredRows -= 1;
    });
    expect(coveredRows).toBe(0);
    return rows;
};

it('virtualizes rows when row grouping is on and subtotals are off', async () => {
    const table = renderGroupedTable();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const rows = getRenderedDataRows(table);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(GROUP_SIZE);
    expect(screen.queryByText(`City ${ROW_COUNT - 1}`)).toBeNull();
    expectRegionCellsCoverRenderedRows(table);
});

it('shows the group value on the first rendered row after scrolling into a group', async () => {
    const table = renderGroupedTable();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * ROW_HEIGHT_PX;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());

    const rows = expectRegionCellsCoverRenderedRows(table);
    expect(rows.length).toBeLessThan(GROUP_SIZE);
    expect(rows[0].rowIndex).toBeGreaterThan(GROUP_SIZE);
    expect(rows[0].rowIndex % GROUP_SIZE).not.toBe(0);
});

it('starts a new merged cell at a group boundary inside the rendered rows', async () => {
    const table = renderGroupedTable();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = (4 * GROUP_SIZE - 5) * ROW_HEIGHT_PX;
    fireEvent.scroll(viewport);
    await waitFor(() =>
        expect(screen.getByText(`City ${4 * GROUP_SIZE}`)).toBeInTheDocument(),
    );

    const rows = expectRegionCellsCoverRenderedRows(table);
    expect(rows[0].rowIndex).toBeLessThan(4 * GROUP_SIZE);
    expect(screen.getByText('Region 3')).toBeInTheDocument();
    expect(screen.getByText('Region 4')).toBeInTheDocument();
});
