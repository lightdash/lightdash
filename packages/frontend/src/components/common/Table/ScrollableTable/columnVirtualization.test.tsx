import { type ResultRow } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ScrollableTable from '.';
import { renderWithProviders } from '../../../../testing/testUtils';
import { TableProvider } from '../TableProvider';
import { type TableColumn } from '../types';

afterEach(() => vi.restoreAllMocks());

it('scrolls through a wide table with matching headers, values and totals while keeping the frozen field mounted', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
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
    renderWithProviders(
        <TableProvider
            data={[row]}
            columns={columns}
            totalRowsCount={1}
            isFetchingRows={false}
            fetchMoreRows={vi.fn()}
            footer={{ show: true }}
            hideRowNumbers
        >
            <ScrollableTable isDashboard showSubtotals={false} />
        </TableProvider>,
    );
    expect(await screen.findByText('value 1')).toBeInTheDocument();
    expect(screen.queryByText('Field 99')).toBeNull();
    expect(screen.queryByText('value 99')).toBeNull();
    expect(screen.queryByText('Total 99')).toBeNull();

    const table = screen.getByRole('table');
    const viewport = table.parentElement!;
    viewport.scrollLeft = 9600;
    fireEvent.scroll(viewport);
    await waitFor(() =>
        expect(screen.getByText('value 99')).toBeInTheDocument(),
    );
    expect(screen.getByText('Field 99')).toBeInTheDocument();
    expect(screen.getByText('Total 99')).toBeInTheDocument();
    expect(screen.getByText('value 0')).toBeInTheDocument();
    expect(screen.queryByText('value 1')).toBeNull();
});
