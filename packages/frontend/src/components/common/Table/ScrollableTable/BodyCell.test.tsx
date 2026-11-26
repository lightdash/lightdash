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

const mergedCell = (meta: Record<string, unknown> = {}) =>
    ({
        id: 'merged-cell',
        column: { columnDef: { meta } },
        getValue: () => ({
            value: { raw: 'West', formatted: 'West\nsecond line' },
        }),
    }) as unknown as Cell<ResultRow, unknown>;

const renderClampedCell = ({
    meta,
    tooltipContent,
}: {
    meta?: Record<string, unknown>;
    tooltipContent?: string;
} = {}) => {
    renderWithProviders(
        <table>
            <tbody>
                <tr>
                    <BodyCell
                        cell={mergedCell(meta)}
                        index={0}
                        isNumericItem={false}
                        hasData
                        rowSpan={2}
                        clampsMergedValue
                        tooltipContent={tooltipContent}
                    >
                        West
                    </BodyCell>
                </tr>
            </tbody>
        </table>,
    );
    return screen.getByRole('cell').querySelector(':scope > span')!;
};

describe('BodyCell clamped merged value', () => {
    it('has the full value in its title', () => {
        expect(renderClampedCell()).toHaveAttribute(
            'title',
            'West\nsecond line',
        );
    });

    it('has no title when the cell shows a tooltip', () => {
        expect(
            renderClampedCell({ tooltipContent: 'Value is West' }),
        ).not.toHaveAttribute('title');
    });

    it.each([
        ['an image', { item: { image: { url: 'https://example.com/a.png' } } }],
        ['rich text', { item: { richText: '**${value.raw}**' } }],
    ])('has no title when the cell shows %s', (_, meta) => {
        expect(renderClampedCell({ meta })).not.toHaveAttribute('title');
    });
});
