import { type ResultRow } from '@lightdash/common';
import { type Cell } from '@tanstack/react-table';
import { act, fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    ControlsSidebarContext,
    type ControlsSidebarContextValue,
} from '../../../../features/dashboardControls/useControlsSidebar';
import { renderWithProviders } from '../../../../testing/testUtils';
import BodyCell from './BodyCell';

vi.mock('./CellMenu', () => ({ default: () => <div>Cell menu</div> }));

const cell = {
    id: 'cell-1',
    column: { columnDef: { meta: {} } },
    getValue: () => ({ value: { raw: 1, formatted: '1' } }),
} as unknown as Cell<ResultRow, unknown>;

const renderCell = (wrap: (node: ReactNode) => ReactNode = (node) => node) =>
    renderWithProviders(
        <>
            {wrap(
                <table>
                    <tbody>
                        <tr>
                            <BodyCell
                                cell={cell}
                                index={0}
                                isNumericItem
                                hasData
                                cellContextMenu={() => null}
                            >
                                1
                            </BodyCell>
                        </tr>
                    </tbody>
                </table>,
            )}
        </>,
    );

describe('BodyCell menu', () => {
    it('opens on a click outside the dashboard controls', () => {
        renderCell();
        fireEvent.click(screen.getByRole('cell'));
        expect(screen.getByText('Cell menu')).toBeInTheDocument();
    });

    it('waits while the filter editor asks, and opens once it is answered', () => {
        let waiting: (() => void) | null = null;
        const value = {
            whenAnswered: (openMenu: () => void) => {
                waiting = openMenu;
            },
        } as unknown as ControlsSidebarContextValue;
        renderCell((node) => (
            <ControlsSidebarContext.Provider value={value}>
                {node}
            </ControlsSidebarContext.Provider>
        ));

        fireEvent.click(screen.getByRole('cell'));
        expect(screen.queryByText('Cell menu')).not.toBeInTheDocument();

        act(() => waiting?.());
        expect(screen.getByText('Cell menu')).toBeInTheDocument();
    });
});
