import {
    convertSqlPivotedRowsToPivotData,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PivotTable from '.';
import { renderWithProviders } from '../../../testing/testUtils';
import { CELL_HEIGHT } from '../LightTable/constants';

const ROW_COUNT = 1000;
const GROUP_SIZE = 100;

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
});
afterEach(() => vi.restoreAllMocks());

const regionOf = (rowIndex: number) =>
    `Region ${Math.floor(rowIndex / GROUP_SIZE)}`;

function buildGroupedPivot() {
    const getField = () => undefined;
    const getFieldLabel = (id: string) => id;
    const data = convertSqlPivotedRowsToPivotData({
        rows: Array.from({ length: ROW_COUNT }, (_, index) => ({
            region: {
                value: { raw: regionOf(index), formatted: regionOf(index) },
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
            columnTotals: false,
            rowTotals: false,
        },
        groupedSubtotals: undefined,
        getField,
        getFieldLabel,
    });
    return { data, getField, getFieldLabel };
}

const renderGroupedPivot = () => {
    const { data, getField, getFieldLabel } = buildGroupedPivot();
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
            enableContextMenu={false}
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
