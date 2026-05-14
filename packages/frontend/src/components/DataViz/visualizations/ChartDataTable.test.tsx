import { type RawResultRow } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ChartDataTable } from './ChartDataTable';

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

        expect(sortableHeaderTh).toHaveStyle({ cursor: 'pointer' });
        expect(pivotedHeaderTh).not.toHaveStyle({ cursor: 'pointer' });
    });
});
