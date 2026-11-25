import {
    DimensionType,
    FieldType,
    type Dimension,
    type ResultRow,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScrollableTable from '.';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ROW_HEIGHT_PX } from '../constants';
import { TableProvider } from '../TableProvider';
import { type CellContextMenuProps, type TableColumn } from '../types';

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

const renderGroupedTable = ({
    getRegion = regionOf,
    cellContextMenu,
}: {
    getRegion?: (rowIndex: number) => string;
    cellContextMenu?: FC<CellContextMenuProps>;
} = {}) => {
    const rows: ResultRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
        region: {
            value: { raw: getRegion(index), formatted: getRegion(index) },
        },
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
            cellContextMenu={cellContextMenu}
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

const scrollViewportTo = async (table: HTMLTableElement, rowIndex: number) => {
    const viewport = table.parentElement!;
    viewport.scrollTop = rowIndex * ROW_HEIGHT_PX;
    fireEvent.scroll(viewport);
};

// The browser sizes a row from its tallest cell. A merged cell whose value has
// more lines than the rows it covers grows those rows, so it must not show more
// lines than it covers.
const getValueLineLimit = (cell: HTMLTableCellElement) => {
    const limit = cell
        .querySelector<HTMLElement>(':scope > span')
        ?.style.getPropertyValue('--merged-row-span');
    return limit ? Number(limit) : undefined;
};

it('limits a merged value to the rows its cell covers when a group restarts on the first rendered row', async () => {
    const pairOf = (rowIndex: number) =>
        `Pair ${Math.floor(rowIndex / 2)}\nsecond line`;
    const table = renderGroupedTable({ getRegion: pairOf });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    await scrollViewportTo(table, 66);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());

    const rows = getRenderedDataRows(table);
    // The window starts on the second row of a two-row group, so that row
    // gets a new one-row cell for the group.
    expect(rows[0].rowIndex % 2).toBe(1);
    const pairCells = Array.from(table.querySelectorAll('td')).filter((td) =>
        td.textContent?.startsWith('Pair '),
    );
    expect(pairCells[0].textContent).toBe(pairOf(rows[0].rowIndex));
    expect(pairCells[0]).not.toHaveAttribute('rowspan');
    pairCells.forEach((cell) => {
        expect(getValueLineLimit(cell)).toBe(
            Number(cell.getAttribute('rowspan') ?? 1),
        );
    });

    const cityCell = Array.from(rows[0].tr.querySelectorAll('td')).find(
        (td) => td.textContent === `City ${rows[0].rowIndex}`,
    )!;
    expect(getValueLineLimit(cityCell)).toBeUndefined();
});

it('keeps the menu of a merged cell open when the rendered rows move by one row', async () => {
    const table = renderGroupedTable({
        cellContextMenu: ({ cell }) => (
            <div>Menu for {cell.getValue()?.value?.formatted}</div>
        ),
    });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    await scrollViewportTo(table, 150);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());
    const firstRowBefore = getRenderedDataRows(table)[0].rowIndex;
    expect(regionOf(firstRowBefore)).toBe('Region 1');

    fireEvent.click(screen.getByText('Region 1'));
    expect(await screen.findByText('Menu for Region 1')).toBeInTheDocument();

    await scrollViewportTo(table, 151);
    await waitFor(() =>
        expect(getRenderedDataRows(table)[0].rowIndex).toBe(firstRowBefore + 1),
    );

    expect(screen.getByText('Menu for Region 1')).toBeInTheDocument();
    expect(screen.getByText('Region 1').closest('td')).toHaveAttribute(
        'data-selected',
        'true',
    );
});

it('closes the menu of a merged cell when its group leaves the rendered rows', async () => {
    const table = renderGroupedTable({
        cellContextMenu: ({ cell }) => (
            <div>Menu for {cell.getValue()?.value?.formatted}</div>
        ),
    });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    await scrollViewportTo(table, 150);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());
    fireEvent.click(screen.getByText('Region 1'));
    expect(await screen.findByText('Menu for Region 1')).toBeInTheDocument();

    await scrollViewportTo(table, 500);
    await waitFor(() => expect(screen.queryByText('Region 1')).toBeNull());
    expect(screen.queryByText('Menu for Region 1')).toBeNull();

    await scrollViewportTo(table, 150);
    expect(await screen.findByText('Region 1')).toBeInTheDocument();
    expect(screen.queryByText('Menu for Region 1')).toBeNull();
});
