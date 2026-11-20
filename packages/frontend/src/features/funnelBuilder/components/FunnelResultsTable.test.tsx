import { type FunnelQueryResult } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ColumnWindowingContext } from '../../../components/common/Table/ColumnWindowingContext';
import { useAppSelector } from '../store';
import { FunnelResultsTable } from './FunnelResultsTable';

vi.mock('../store', () => ({ useAppSelector: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

function renderFunnel(
    count: number,
    breakdownValue?: string,
    columnWindowing = true,
) {
    const results: FunnelQueryResult = {
        sql: '',
        steps: Array.from({ length: count }, (_, i) => ({
            stepOrder: i + 1,
            stepName: `event_${i + 1}`,
            breakdownValue,
            totalUsers: 300 - i,
            stepConversionRate: 100 - i,
            conversionRate: 100 - i,
            medianTimeToConvertSeconds: i * 60,
        })).reverse(),
    };
    vi.mocked(useAppSelector).mockReturnValue(results);
    render(
        <MantineProvider env="test">
            <ColumnWindowingContext.Provider value={columnWindowing}>
                <FunnelResultsTable />
            </ColumnWindowingContext.Provider>
        </MantineProvider>,
    );
}

it('shows all metrics in step order for a short funnel without a breakdown', () => {
    renderFunnel(2);
    const [steps, metrics, values] = screen.getAllByRole('row');
    expect(
        within(steps)
            .getAllByRole('columnheader')
            .map((th) => th.textContent),
    ).toEqual(['1Event 1', '2Event 2']);
    expect(
        within(metrics)
            .getAllByRole('columnheader')
            .map((th) => th.textContent),
    ).toEqual(['Users', 'Conv %', '—', 'Users', 'Conv %', 'Time']);
    expect(
        within(values)
            .getAllByRole('cell')
            .map((td) => td.textContent),
    ).toEqual(['300', '100.0%', '—', '299', '99.0%', '1m']);
});

it('scrolls step headers and their metrics together in a wide funnel with a breakdown', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    renderFunnel(60, 'Free');
    const table = screen.getByRole<HTMLTableElement>('table');
    expect(table).toHaveAttribute('aria-colcount', '181');
    const [steps, metrics, values] = screen.getAllByRole('row');
    expect(within(steps).getByText('Breakdown')).toHaveAttribute(
        'rowspan',
        '2',
    );
    expect(within(steps).getByText('Event 1')).toHaveAttribute('colspan', '3');
    expect(within(values).getByText('Free')).toBeVisible();
    expect(within(values).getByText('300')).toBeVisible();
    expect(within(steps).queryByText('Event 60')).toBeNull();
    expect(within(values).queryByText('241')).toBeNull();

    const totalWidth = Number.parseFloat(
        table.style.width.replace('calc(', ''),
    );
    fireEvent.scroll(table.parentElement!, {
        target: { scrollLeft: totalWidth - 400 },
    });
    expect(await within(steps).findByText('Event 60')).toHaveAttribute(
        'colspan',
        '3',
    );
    const groupHeaders = within(steps)
        .getAllByRole<HTMLTableCellElement>('columnheader')
        .slice(1);
    expect(groupHeaders.at(-1)).toHaveAttribute('aria-colindex', '179');
    expect(within(values).getByText('59m')).toHaveAttribute(
        'aria-colindex',
        '181',
    );
    expect(groupHeaders[0].colSpan).toBeLessThan(3);
    expect(
        groupHeaders.reduce((count, header) => count + header.colSpan, 0),
    ).toBe(within(metrics).getAllByRole('columnheader').length);
    expect(within(steps).queryByText('Event 1')).toBeNull();
    expect(within(values).queryByText('300')).toBeNull();
    expect(
        within(values)
            .getAllByRole('cell')
            .slice(-3)
            .map((td) => td.textContent),
    ).toEqual(['241', '41.0%', '59m']);
    expect(
        within(metrics)
            .getAllByRole('columnheader')
            .slice(-3)
            .map((th) => th.textContent),
    ).toEqual(['Users', 'Conv %', 'Time']);
});

it('renders every step of a wide funnel when column windowing is off', () => {
    renderFunnel(60, 'Free', false);
    const table = screen.getByRole('table');
    expect(table).not.toHaveAttribute('aria-colcount');
    expect(within(table).getByText('Event 1')).toBeInTheDocument();
    expect(within(table).getByText('Event 60')).toBeInTheDocument();
    expect(within(table).getByText('59m')).toBeInTheDocument();
});
