import {
    DimensionType,
    FieldType,
    type Dimension,
    type ResultRow,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScrollableTable from '.';
import { renderWithProviders } from '../../../../testing/testUtils';
import { StaticTableRenderContext } from '../StaticTableRenderContext';
import { TableProvider } from '../TableProvider';
import { type TableColumn } from '../types';

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
});
afterEach(() => vi.restoreAllMocks());

function makeWideTable() {
    const row: ResultRow = {};
    const columns: TableColumn[] = Array.from({ length: 100 }, (_, i) => {
        const id = `field_${i}`;
        row[id] = { value: { raw: i, formatted: `value ${i}` } };
        return {
            id,
            accessorFn: (data) => data[id],
            header: `Field ${i}`,
            cell: (info) => info.getValue().value.formatted,
            footer: `Total ${i}`,
            meta: { width: 100, frozen: i === 0 },
        };
    });
    return { row, columns };
}

it.each(['dashboard', 'explore', 'row grouping', 'grouped headers'] as const)(
    'scrolls to the last column while keeping headers, totals and frozen cells aligned in %s',
    async (mode) => {
        const { row, columns } = makeWideTable();
        renderWithProviders(
            <TableProvider
                data={[row]}
                columns={
                    mode === 'grouped headers'
                        ? [
                              columns[0],
                              {
                                  id: 'first',
                                  header: 'First group',
                                  columns: columns.slice(1, 50),
                              },
                              {
                                  id: 'second',
                                  header: 'Second group',
                                  columns: columns.slice(50),
                              },
                          ]
                        : columns
                }
                totalRowsCount={1}
                isFetchingRows={false}
                fetchMoreRows={vi.fn()}
                footer={{ show: true }}
                hideRowNumbers
            >
                <ScrollableTable
                    isDashboard={mode === 'dashboard'}
                    showSubtotals={mode === 'explore'}
                    showRowGrouping={mode === 'row grouping'}
                />
            </TableProvider>,
        );
        expect(await screen.findByText('value 1')).toBeInTheDocument();
        expect(screen.queryByText('Field 99')).toBeNull();
        expect(screen.queryByText('value 99')).toBeNull();
        expect(screen.queryByText('Total 99')).toBeNull();
        if (mode === 'grouped headers') {
            expect(screen.getByText('First group')).toBeInTheDocument();
            expect(screen.queryByText('Second group')).toBeNull();
        }

        const table = screen.getByRole('table');
        const viewport = table.parentElement!;
        viewport.scrollLeft = 9600;
        fireEvent.scroll(viewport);
        await waitFor(() =>
            expect(screen.getByText('value 99')).toBeInTheDocument(),
        );
        expect(screen.getByText('Field 99')).toBeInTheDocument();
        expect(screen.getByText('Total 99')).toBeInTheDocument();
        expect(screen.getByText('Field 99').closest('th')).toHaveAttribute(
            'aria-colindex',
            '100',
        );
        expect(screen.getByText('value 99').closest('td')).toHaveAttribute(
            'aria-colindex',
            '100',
        );
        expect(screen.getByText('Total 99').closest('th')).toHaveAttribute(
            'aria-colindex',
            '100',
        );
        expect(screen.getByText('value 0')).toBeInTheDocument();
        expect(screen.queryByText('value 1')).toBeNull();
        if (mode === 'grouped headers') {
            expect(screen.getByText('Second group')).toBeInTheDocument();
            expect(screen.queryByText('First group')).toBeNull();
        }
    },
);

it('renders every column for static capture', async () => {
    const { row, columns } = makeWideTable();
    renderWithProviders(
        <StaticTableRenderContext.Provider value>
            <TableProvider
                data={[row]}
                columns={columns}
                totalRowsCount={1}
                isFetchingRows={false}
                fetchMoreRows={vi.fn()}
                footer={{ show: true }}
                hideRowNumbers
            >
                <ScrollableTable />
            </TableProvider>
        </StaticTableRenderContext.Provider>,
    );
    expect(await screen.findByText('value 99')).toBeInTheDocument();
    expect(screen.getByText('Field 99')).toBeInTheDocument();
    expect(screen.getByText('Total 99')).toBeInTheDocument();
    expect(screen.getByText('value 0')).toBeInTheDocument();
});

it('uses the reordered visible columns and their current widths', async () => {
    const { row, columns } = makeWideTable();
    const renderTable = (fields: TableColumn[], columnOrder?: string[]) => (
        <TableProvider
            data={[row]}
            columns={fields}
            columnOrder={columnOrder}
            totalRowsCount={1}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            footer={{ show: true }}
            hideRowNumbers
        >
            <ScrollableTable />
        </TableProvider>
    );
    const { rerender } = renderWithProviders(renderTable(columns));
    expect(await screen.findByText('value 1')).toBeInTheDocument();
    const fields = columns.map((field, index) => ({
        ...field,
        meta: {
            ...field.meta,
            width: index === 99 ? undefined : 100,
            styleProps:
                index === 99 ? { w: 500, miw: 500, maw: 500 } : undefined,
            isVisible: index !== 97,
        },
    }));
    rerender(renderTable(fields, fields.map((field) => field.id!).reverse()));
    expect(await screen.findByText('value 99')).toBeInTheDocument();
    expect(screen.getByText('value 0')).toBeInTheDocument();
    expect(screen.queryByText('value 97')).toBeNull();
    expect(screen.queryByText('value 1')).toBeNull();
    expect(screen.getByText('Field 99').closest('th')).toHaveAttribute(
        'aria-colindex',
        '2',
    );
    expect(screen.getByText('Total 99').closest('th')).toHaveAttribute(
        'aria-colindex',
        '2',
    );
    expect(screen.getByRole('table')).toHaveAttribute('aria-colcount', '99');
    expect(
        screen
            .getByRole('table')
            .style.getPropertyValue('--virtual-table-width'),
    ).toBe('10300px');
});

it('keeps a focused header mounted while scrolling until focus leaves it', async () => {
    const { row, columns } = makeWideTable();
    renderWithProviders(
        <TableProvider
            data={[row]}
            columns={columns.map((field) => ({
                ...field,
                meta: { ...field.meta, draggable: true },
            }))}
            totalRowsCount={1}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            hideRowNumbers
        >
            <ScrollableTable minimal={false} />
        </TableProvider>,
    );
    const handle = await screen.findByRole('button', { name: 'Field 1' });
    handle.focus();
    fireEvent.scroll(screen.getByRole('table').parentElement!, {
        target: { scrollLeft: 9600 },
    });
    const last = await screen.findByRole('button', { name: 'Field 99' });
    expect(handle).toHaveFocus();
    expect(screen.queryByText('Field 50')).toBeNull();
    last.focus();
    await waitFor(() => expect(handle).not.toBeInTheDocument());
});

it('keeps the dragged column mounted when scrolling to a distant drop target', async () => {
    const { row, columns } = makeWideTable();
    const fields = columns.map((field) => ({
        ...field,
        meta: { ...field.meta, draggable: true },
    }));
    renderWithProviders(
        <TableProvider
            data={[row]}
            columns={fields}
            columnOrder={fields.map((field) => field.id!)}
            totalRowsCount={1}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            hideRowNumbers
        >
            <ScrollableTable minimal={false} />
        </TableProvider>,
    );
    const table = screen.getByRole('table');
    const handle = await within(table).findByRole('button', {
        name: 'Field 1',
    });
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    const viewport = table.parentElement!;
    viewport.scrollLeft = 9600;
    fireEvent.scroll(viewport);
    expect(await within(table).findByText('value 99')).toBeInTheDocument();
    expect(within(table).getByText('Field 1')).toBeInTheDocument();
    expect(within(table).getByText('value 1')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() =>
        expect(within(table).queryByText('value 1')).toBeNull(),
    );
});

it('resizes the same field on rows with a merged dimension', async () => {
    const { row, columns } = makeWideTable();
    const saveWidth = vi.fn();
    const fields = columns.map((field, index) => ({
        ...field,
        meta: {
            ...field.meta,
            item:
                index < 2
                    ? ({
                          fieldType: FieldType.DIMENSION,
                          type: DimensionType.STRING,
                          table: 't',
                          name: field.id,
                          label: field.id,
                      } as Dimension)
                    : undefined,
        },
    }));
    renderWithProviders(
        <TableProvider
            data={[row, row]}
            columns={fields}
            columnOrder={fields.map((field) => field.id!)}
            totalRowsCount={2}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            onColumnWidthChange={saveWidth}
            hideRowNumbers
        >
            <ScrollableTable
                minimal={false}
                showRowGrouping
                showSubtotals={false}
            />
        </TableProvider>,
    );
    expect((await screen.findByText('value 0')).closest('td')).toHaveAttribute(
        'rowspan',
        '2',
    );
    const header = screen.getByText('Field 2').closest('th')!;
    const table = screen.getByRole('table');
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(
        DOMRect.fromRect({ width: 100 }),
    );
    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(
        DOMRect.fromRect({ width: 10000 }),
    );
    fireEvent.mouseDown(within(header).getByRole('separator'), { clientX: 0 });
    fireEvent.mouseMove(document, { clientX: -30 });
    expect(table.style.width).toBe('9970px');
    expect(table.style.minWidth).toBe('9970px');
    expect(screen.getAllByText('value 2')[1].closest('td')!.style.width).toBe(
        '70px',
    );
    const neighbor = screen.getAllByText('value 3')[1].closest('td')!;
    expect(neighbor.style.width).toBe('');
    fireEvent.mouseUp(document, { clientX: -30 });
    expect(saveWidth).toHaveBeenCalledWith('field_2', 70);
    expect(table.style.width).toBe('');
});

it('fits the Total label and sizes unsaved columns using their displayed contents', async () => {
    const { row, columns } = makeWideTable();
    const fields = columns.map((field, index) => {
        if (index >= 3) return field;
        return { ...field, header: 'ID', meta: {} };
    });
    fields[2].meta = { headerText: 'Customer reference number' };
    row.field_1.value.formatted = '$123,456,789.00';
    renderWithProviders(
        <TableProvider
            data={[row]}
            columns={fields}
            totalRowsCount={1}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            footer={{ show: true }}
        >
            <ScrollableTable />
        </TableProvider>,
    );
    const table = (await screen.findByText('Total')).closest('table')!;
    const columnWidth = (index: number) => {
        const col = table.querySelector<HTMLTableColElement>(
            `col[data-column-index="${index}"]`,
        );
        return Number(col?.style.width.match(/[\d.]+/)?.[0]);
    };
    expect(columnWidth(1)).toBeGreaterThan(30);
    expect(columnWidth(3)).toBeGreaterThan(columnWidth(2));
    expect(columnWidth(4)).toBeGreaterThan(columnWidth(2));
    expect(columnWidth(5)).toBe(100);
});

it.each([false, true])(
    'windows 41 data columns when hideRowNumbers is %s',
    async (hideRowNumbers) => {
        const { row, columns } = makeWideTable();
        renderWithProviders(
            <TableProvider
                data={[row]}
                columns={columns.slice(0, 41)}
                totalRowsCount={1}
                isFetchingRows={false}
                fetchMoreRows={vi.fn()}
                hideRowNumbers={hideRowNumbers}
            >
                <ScrollableTable />
            </TableProvider>,
        );
        expect(await screen.findByText('value 0')).toBeInTheDocument();
        expect(screen.getByRole('table')).toHaveAttribute(
            'aria-colcount',
            hideRowNumbers ? '41' : '42',
        );
    },
);
