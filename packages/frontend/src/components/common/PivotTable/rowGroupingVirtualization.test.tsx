import {
    convertSqlPivotedRowsToPivotData,
    SessionStorageKeys,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PivotTable from '.';
import {
    FakeResizeObserver,
    resizeTarget,
} from '../../../testing/fakeResizeObserver';
import { renderWithProviders } from '../../../testing/testUtils';
import { CELL_HEIGHT } from '../LightTable/constants';
import { TABLE_LINE_HEIGHT_PX } from './getRowSpanMerges';

// The menu's actions need app data; these tests only check cell selection.
vi.mock('./ValueCellMenu', () => ({
    default: ({ children }: PropsWithChildren) => children,
}));

const ROW_COUNT = 1000;
const GROUP_SIZE = 100;

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
});

const regionOf = (rowIndex: number) =>
    `Region ${Math.floor(rowIndex / GROUP_SIZE)}`;

function buildGroupedPivot({
    columnTotals = false,
    getRegion = regionOf,
    rowCount = ROW_COUNT,
}: {
    columnTotals?: boolean;
    getRegion?: (rowIndex: number) => string;
    rowCount?: number;
} = {}) {
    const getField = () => undefined;
    const getFieldLabel = (id: string) => id;
    const data = convertSqlPivotedRowsToPivotData({
        rows: Array.from({ length: rowCount }, (_, index) => ({
            region: {
                value: { raw: getRegion(index), formatted: getRegion(index) },
            },
            city: {
                value: { raw: `City ${index}`, formatted: `City ${index}` },
            },
            sales_0: { value: { raw: index, formatted: `Sales ${index}` } },
        })),
        pivotDetails: {
            indexColumn: [
                { type: VizIndexType.CATEGORY, reference: 'region' },
                { type: VizIndexType.CATEGORY, reference: 'city' },
            ],
            groupByColumns: [{ reference: 'year' }],
            valuesColumns: [
                {
                    referenceField: 'sales',
                    aggregation: VizAggregationOptions.ANY,
                    pivotColumnName: 'sales_0',
                    pivotValues: [{ referenceField: 'year', value: '2026' }],
                },
            ],
            sortBy: [],
            originalColumns: {},
            totalColumnCount: 1,
        },
        pivotConfig: {
            metricsAsRows: false,
            columnTotals,
            rowTotals: false,
        },
        groupedSubtotals: undefined,
        getField,
        getFieldLabel,
    });
    return { data, getField, getFieldLabel };
}

const renderGroupedPivot = ({
    columnTotals = false,
    enableContextMenu = false,
    getRegion = regionOf,
    rowCount = ROW_COUNT,
}: {
    columnTotals?: boolean;
    enableContextMenu?: boolean;
    getRegion?: (rowIndex: number) => string;
    rowCount?: number;
} = {}) => {
    const { data, getField, getFieldLabel } = buildGroupedPivot({
        columnTotals,
        getRegion,
        rowCount,
    });
    renderWithProviders(
        <PivotTable
            data={data}
            conditionalFormattings={[]}
            minMaxMap={{}}
            getField={getField}
            getFieldLabel={getFieldLabel}
            hideRowNumbers
            isMinimal={false}
            showRowGrouping
            showSubtotals={false}
            enableContextMenu={enableContextMenu}
            renderSortMenu={() => null}
        />,
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
    const table = renderGroupedPivot();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const rows = getRenderedDataRows(table);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(GROUP_SIZE);
    expect(screen.queryByText(`City ${ROW_COUNT - 1}`)).toBeNull();
    expectRegionCellsCoverRenderedRows(table);
});

it('shows the group value on the first rendered row after scrolling into a group', async () => {
    const table = renderGroupedPivot();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());

    const rows = expectRegionCellsCoverRenderedRows(table);
    expect(rows.length).toBeLessThan(GROUP_SIZE);
    expect(rows[0].rowIndex).toBeGreaterThan(GROUP_SIZE);
    expect(rows[0].rowIndex % GROUP_SIZE).not.toBe(0);
});

it('starts a new merged cell at a group boundary inside the rendered rows', async () => {
    const table = renderGroupedPivot();
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = (4 * GROUP_SIZE - 5) * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() =>
        expect(screen.getByText(`City ${4 * GROUP_SIZE}`)).toBeInTheDocument(),
    );

    const rows = expectRegionCellsCoverRenderedRows(table);
    expect(rows[0].rowIndex).toBeLessThan(4 * GROUP_SIZE);
    expect(screen.getByText('Region 3')).toBeInTheDocument();
    expect(screen.getByText('Region 4')).toBeInTheDocument();
});

// The browser sizes a row from its tallest cell. Pivot cells keep line breaks,
// so a merged cell must not show more lines than fit in the rows it covers.
const getValueSpan = (cell: HTMLTableCellElement) =>
    cell.querySelector<HTMLElement>(':scope > span');

const getValueLineLimit = (cell: HTMLTableCellElement) => {
    const limit = getValueSpan(cell)?.style.getPropertyValue('--lt-line-clamp');
    return limit ? Number(limit) : undefined;
};

it('shows the lines of a merged value that fit in the rows its cell covers', async () => {
    const pairOf = (rowIndex: number) =>
        `Pair ${Math.floor(rowIndex / 2)}\nsecond line\nthird line`;
    const table = renderGroupedPivot({ getRegion: pairOf });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
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
    // One row fits one line. Two rows fit all three lines.
    expect(getValueLineLimit(pairCells[0])).toBe(1);
    // A one-line value keeps the cell's own line height, so the row keeps the
    // height of the rows next to it.
    expect(getValueSpan(pairCells[0])!.style.lineHeight).toBe('');
    const twoRowCells = pairCells.filter(
        (cell) => cell.getAttribute('rowspan') === '2',
    );
    expect(twoRowCells.length).toBeGreaterThan(0);
    twoRowCells.forEach((cell) => {
        expect(getValueLineLimit(cell)).toBe(3);
        // The line count assumes this line height.
        expect(getValueSpan(cell)!.style.lineHeight).toBe(
            `${TABLE_LINE_HEIGHT_PX}px`,
        );
    });

    const cityCell = Array.from(rows[0].tr.querySelectorAll('td')).find(
        (td) => td.textContent === `City ${rows[0].rowIndex}`,
    )!;
    expect(getValueLineLimit(cityCell)).toBeUndefined();
});

it('keeps a merged cell selected when the rendered rows move by one row', async () => {
    const table = renderGroupedPivot({ enableContextMenu: true });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());
    const firstRowBefore = getRenderedDataRows(table)[0].rowIndex;
    expect(regionOf(firstRowBefore)).toBe('Region 1');

    fireEvent.click(screen.getByText('Region 1'));
    expect(screen.getByText('Region 1').closest('td')).toHaveAttribute(
        'data-is-selected',
        'true',
    );

    viewport.scrollTop = 151 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() =>
        expect(getRenderedDataRows(table)[0].rowIndex).toBe(firstRowBefore + 1),
    );

    expect(screen.getByText('Region 1').closest('td')).toHaveAttribute(
        'data-is-selected',
        'true',
    );
});

it('clears the selection of a merged cell when its group leaves the rendered rows', async () => {
    const table = renderGroupedPivot({ enableContextMenu: true });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());
    fireEvent.click(screen.getByText('Region 1'));
    expect(screen.getByText('Region 1').closest('td')).toHaveAttribute(
        'data-is-selected',
        'true',
    );

    viewport.scrollTop = 500 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('Region 1')).toBeNull());

    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    expect(await screen.findByText('Region 1')).toBeInTheDocument();
    expect(screen.getByText('Region 1').closest('td')).toHaveAttribute(
        'data-is-selected',
        'false',
    );
});

it('shows the footer shadow on first render when the rows are taller than the viewport', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const VIEWPORT_HEIGHT = 200;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
        VIEWPORT_HEIGHT,
    );
    // A rough layout: every rendered row is one cell tall.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
        function scrollHeight(this: HTMLElement) {
            const contentHeight =
                this.querySelectorAll('tr').length * CELL_HEIGHT;
            return Math.max(contentHeight, VIEWPORT_HEIGHT);
        },
    );

    const table = renderGroupedPivot({ columnTotals: true });
    expect(await screen.findByText('City 0')).toBeInTheDocument();
    const footer = table.querySelector('tfoot')!;

    // The browser reports the table size when the virtualized rows render.
    resizeTarget(table, 400, table.querySelectorAll('tr').length * CELL_HEIGHT);

    expect(table.parentElement!.scrollTop).toBe(0);
    expect(footer).toHaveAttribute('data-shadow', 'true');
});

it('shows the full merged value when the rendered rows cannot clip the table', async () => {
    const fiveLinesOf = (rowIndex: number) =>
        `Pair ${Math.floor(rowIndex / 2)}\nline 2\nline 3\nline 4\nline 5`;
    const table = renderGroupedPivot({ getRegion: fiveLinesOf, rowCount: 20 });
    expect(await screen.findByText('City 19')).toBeInTheDocument();

    const pairCells = Array.from(table.querySelectorAll('td')).filter((td) =>
        td.textContent?.startsWith('Pair '),
    );
    expect(pairCells).toHaveLength(10);
    pairCells.forEach((cell) => {
        expect(cell).toHaveAttribute('rowspan', '2');
        expect(getValueLineLimit(cell)).toBeUndefined();
    });
});

it('shows the full merged value in an image export or a scheduled delivery', async () => {
    // The headless browser sets this for every export and delivery.
    window.sessionStorage.setItem(SessionStorageKeys.HEADLESS_CAPTURE, 'true');
    const fiveLinesOf = (rowIndex: number) =>
        `Pair ${Math.floor(rowIndex / 2)}\nline 2\nline 3\nline 4\nline 5`;
    const table = renderGroupedPivot({ getRegion: fiveLinesOf });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const pairCells = Array.from(table.querySelectorAll('td')).filter((td) =>
        td.textContent?.startsWith('Pair '),
    );
    // The table is long enough for the rendered rows to clip merged cells.
    expect(
        pairCells.filter((cell) => cell.getAttribute('rowspan') === '2').length,
    ).toBeGreaterThan(0);
    pairCells.forEach((cell) =>
        expect(getValueLineLimit(cell)).toBeUndefined(),
    );
});

it('shows the full value on hover only when the clamp cuts the value', async () => {
    // A rough layout: a clamped value is as tall as its lines, and shows the
    // lines its clamp allows.
    const lineCount = (element: HTMLElement) =>
        (element.textContent ?? '').split('\n').length;
    const clampOf = (element: HTMLElement) =>
        Number(element.style.getPropertyValue('--lt-line-clamp')) || Infinity;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
        function scrollHeight(this: HTMLElement) {
            return lineCount(this) * TABLE_LINE_HEIGHT_PX;
        },
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
        function clientHeight(this: HTMLElement) {
            return (
                Math.min(lineCount(this), clampOf(this)) * TABLE_LINE_HEIGHT_PX
            );
        },
    );
    const pairOf = (rowIndex: number) =>
        `Pair ${Math.floor(rowIndex / 2)}\nsecond line\nthird line`;
    const table = renderGroupedPivot({ getRegion: pairOf });
    expect(await screen.findByText('City 0')).toBeInTheDocument();

    const viewport = table.parentElement!;
    viewport.scrollTop = 150 * CELL_HEIGHT;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.queryByText('City 0')).toBeNull());

    const pairCells = Array.from(table.querySelectorAll('td')).filter((td) =>
        td.textContent?.startsWith('Pair '),
    );
    // A one-row cell shows 1 of 3 lines. A two-row cell shows all 3.
    const [cutCell] = pairCells;
    expect(getValueLineLimit(cutCell)).toBe(1);
    const fullCells = pairCells.filter(
        (cell) => cell.getAttribute('rowspan') === '2',
    );
    expect(fullCells.length).toBeGreaterThan(0);

    // No cell has a title before a hover.
    pairCells.forEach((cell) =>
        expect(getValueSpan(cell)).not.toHaveAttribute('title'),
    );

    fireEvent.mouseEnter(getValueSpan(cutCell)!);
    expect(getValueSpan(cutCell)).toHaveAttribute('title', cutCell.textContent);

    fullCells.forEach((cell) => {
        fireEvent.mouseEnter(getValueSpan(cell)!);
        expect(getValueSpan(cell)).not.toHaveAttribute('title');
    });
});
