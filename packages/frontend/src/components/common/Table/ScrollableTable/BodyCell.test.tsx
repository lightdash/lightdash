import { type ResultRow } from '@lightdash/common';
import { type Cell } from '@tanstack/react-table';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import BodyCell from './BodyCell';

vi.mock('./CellMenu', () => ({ default: () => <div>Cell menu</div> }));

const cell = {
    id: 'cell-1',
    column: { columnDef: { meta: {} } },
    getValue: () => ({ value: { raw: 1, formatted: '1' } }),
} as unknown as Cell<ResultRow, unknown>;

const renderCell = () =>
    renderWithProviders(
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
    );

describe('BodyCell menu', () => {
    it('opens on a click', () => {
        renderCell();
        fireEvent.click(screen.getByRole('cell'));
        expect(screen.getByText('Cell menu')).toBeInTheDocument();
    });
});
