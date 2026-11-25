import { type ResultRow } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { useState, type FC, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScrollableTable from '.';
import { getFirstResultsPageSize } from '../../../../hooks/resultsFirstPage';
import { renderWithProviders } from '../../../../testing/testUtils';
import { TableProvider } from '../TableProvider';
import { type HeaderProps, type TableColumn } from '../types';

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
});
afterEach(() => vi.restoreAllMocks());

const COLUMN_COUNT = 2000;
const EMPTY_CELL = { value: { raw: null, formatted: '' } };

const columns: TableColumn[] = Array.from({ length: COLUMN_COUNT }, (_, i) => {
    const id = `field_${i}`;
    return {
        id,
        accessorFn: (data) => data[id] ?? EMPTY_CELL,
        header: `Field ${i}`,
        cell: (info) => info.getValue().value.formatted,
        meta: { headerText: `Field ${i}` },
    };
});

const makeRows = (count: number): ResultRow[] =>
    Array.from({ length: count }, (_, rowIndex) => {
        const row: ResultRow = {};
        for (let i = 0; i < 3; i += 1) {
            row[`field_${i}`] = {
                value: {
                    raw: rowIndex,
                    formatted:
                        rowIndex === 30
                            ? 'a much longer value than the rest'
                            : 'v',
                },
            };
        }
        return row;
    });

const HeaderMenu: FC<PropsWithChildren<HeaderProps>> = ({ header }) => {
    const [open, setOpen] = useState(false);
    if (header.column.id !== 'field_1') return null;
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Open menu
            </button>
            {open && <div role="menu">Column menu</div>}
        </>
    );
};

const renderTable = (rows: ResultRow[]) => (
    <TableProvider
        data={rows}
        columns={columns}
        totalRowsCount={2000}
        isFetchingRows={false}
        fetchMoreRows={vi.fn()}
        headerContextMenu={HeaderMenu}
        hideRowNumbers
    >
        <ScrollableTable isDashboard />
    </TableProvider>
);

const headerWidth = () => {
    const col = document.querySelector('col[data-column-index="2"]');
    return col ? window.getComputedStyle(col).width : undefined;
};

it('keeps an open column menu and column widths across the swap to 500 rows', async () => {
    const firstPageSize = getFirstResultsPageSize(COLUMN_COUNT);
    const { rerender } = renderWithProviders(
        renderTable(makeRows(firstPageSize)),
        undefined,
        { columnWindowing: true },
    );
    await screen.findByText('Field 1');
    const widthBefore = headerWidth();
    expect(widthBefore).toMatch(/px/);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    rerender(renderTable(makeRows(500)));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(headerWidth()).toBe(widthBefore);
});
