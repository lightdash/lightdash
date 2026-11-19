import { type RawResultRow } from '@lightdash/common';
import { ColumnGrouping } from '@tanstack/react-table';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseResultsRunner } from '../../../features/queryRunner/BaseResultsRunner';
import { renderWithProviders } from '../../../testing/testUtils';
import { ChartDataTable } from './ChartDataTable';
import { Table } from './Table';

describe('wide SQL results', () => {
    afterEach(() => vi.restoreAllMocks());
    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            200,
        );
    });

    it.each(['chart data', 'compact results'])(
        'scrolls headers and values together in %s',
        async (view) => {
            const created = vi.spyOn(ColumnGrouping, 'createCell');
            const columnNames = Array.from(
                { length: 100 },
                (_, i) => `field_${i}`,
            );
            const rows = [
                Object.fromEntries(
                    columnNames.map((name) => [name, `value_${name}`]),
                ),
            ];
            const compact = view === 'compact results';
            if (compact) {
                const runner = new BaseResultsRunner({
                    fields: [],
                    columnNames,
                    rows,
                    runPivotQuery: vi.fn(),
                });
                renderWithProviders(
                    <Table
                        resultsRunner={runner}
                        columnsConfig={{}}
                        density="compact"
                    />,
                );
                expect(
                    screen.getByRole('columnheader', { name: '#' }),
                ).toHaveAttribute('aria-colindex', '1');
                expect(screen.getByRole('cell', { name: '1' })).toHaveAttribute(
                    'aria-colindex',
                    '1',
                );
            } else {
                renderWithProviders(
                    <ChartDataTable columnNames={columnNames} rows={rows} />,
                );
            }
            const table = screen.getByRole('table');
            const grid = within(table);
            const columnCount = compact ? '101' : '100';
            expect(table).toHaveAttribute('aria-colcount', columnCount);
            expect(grid.getByText('field_0')).toBeInTheDocument();
            expect(grid.getByText('value_field_0')).toBeInTheDocument();
            expect(grid.queryByText('field_99')).not.toBeInTheDocument();
            expect(grid.queryByText('value_field_99')).not.toBeInTheDocument();
            const createdColumnIds = () =>
                created.mock.calls.map(([cell]) => cell.column.id);
            expect(createdColumnIds()).toContain('field_0');
            expect(createdColumnIds()).not.toContain('field_99');

            const getWidth = () =>
                parseFloat(
                    table.style.getPropertyValue('--virtual-table-width'),
                );
            const width = getWidth();
            fireEvent.scroll(table.parentElement!, {
                target: { scrollLeft: width - 400 },
            });
            expect(
                await grid.findByRole('columnheader', { name: 'field_99' }),
            ).toHaveAttribute('aria-colindex', columnCount);
            expect(
                grid.getByRole('cell', { name: 'value_field_99' }),
            ).toHaveAttribute('aria-colindex', columnCount);
            expect(grid.queryByText('field_0')).not.toBeInTheDocument();
            expect(grid.queryByText('value_field_0')).not.toBeInTheDocument();
            expect(getWidth()).toBe(width);
            expect(createdColumnIds()).toContain('field_99');
            expect(createdColumnIds()).not.toContain('field_50');
        },
    );
});

describe('ChartDataTable — pivoted column sort affordance (#12560)', () => {
    const columnNames = ['indexCol', 'pivotedCol'];
    const rows: RawResultRow[] = [];

    it('fires onTHClick for a column present in thSortConfig', async () => {
        const onTHClick = vi.fn();
        renderWithProviders(
            <ChartDataTable
                columnNames={columnNames}
                rows={rows}
                thSortConfig={{ indexCol: { direction: undefined } }}
                onTHClick={onTHClick}
            />,
        );

        await userEvent.click(screen.getByText('indexCol'));
        expect(onTHClick).toHaveBeenCalledWith('indexCol');
    });

    it('does not fire onTHClick for a column missing from thSortConfig (pivoted/group column)', async () => {
        // The bug: users could sort by pivoted columns even though it makes no sense.
        // Fix in PR #12569 made ContentPanel exclude pivoted columns from thSortConfig
        // and ChartDataTable only attaches onClick when sortConfig exists. Locking the
        // header layer pins the contract that downstream consumers (SQL runner, viz)
        // rely on.
        const onTHClick = vi.fn();
        renderWithProviders(
            <ChartDataTable
                columnNames={columnNames}
                rows={rows}
                thSortConfig={{ indexCol: { direction: undefined } }}
                onTHClick={onTHClick}
            />,
        );

        await userEvent.click(screen.getByText('pivotedCol'));
        expect(onTHClick).not.toHaveBeenCalled();
    });

    it('renders the "cannot sort" tooltip label for pivoted columns when hovered', async () => {
        renderWithProviders(
            <ChartDataTable
                columnNames={columnNames}
                rows={rows}
                thSortConfig={{ indexCol: { direction: undefined } }}
                onTHClick={vi.fn()}
            />,
        );

        await userEvent.hover(screen.getByText('pivotedCol'));

        expect(
            await screen.findByText('You cannot sort by a group column'),
        ).toBeInTheDocument();
    });

    it('omits the cursor:pointer affordance on pivoted column headers', () => {
        renderWithProviders(
            <ChartDataTable
                columnNames={columnNames}
                rows={rows}
                thSortConfig={{ indexCol: { direction: undefined } }}
                onTHClick={vi.fn()}
            />,
        );

        const sortableHeaderTh = screen.getByText('indexCol').closest('th');
        const pivotedHeaderTh = screen.getByText('pivotedCol').closest('th');

        expect(sortableHeaderTh).toHaveAttribute('data-sortable');
        expect(pivotedHeaderTh).not.toHaveAttribute('data-sortable');
    });
});
