import { type CaptureTarget } from '../capture/types';
import { clip, onTile, type PartTile } from './partLabel';

const VALUE_MAX = 40;
const HEADER_MAX = 32;

const textOf = (cell: Element): string =>
    (cell.textContent ?? '').replace(/\s+/g, ' ').trim();

const spanOf = (cell: Element): number =>
    Math.max(1, Number(cell.getAttribute('colspan')) || 1);

const indexIn = (element: Element): number =>
    element.parentElement
        ? Array.prototype.indexOf.call(element.parentElement.children, element)
        : 0;

// The header over a cell: by where it is drawn, else by its place in the row.
const headerOver = (cell: Element): string | null => {
    const headerRows = cell.closest('table')?.querySelectorAll('thead tr');
    const headerRow = headerRows?.[headerRows.length - 1];
    if (!headerRow) return null;
    const box = cell.getBoundingClientRect();
    if (box.width > 0) {
        const centre = box.left + box.width / 2;
        for (const header of headerRow.children) {
            const span = header.getBoundingClientRect();
            if (centre >= span.left && centre < span.right) {
                return textOf(header) || null;
            }
        }
    }
    let column = 0;
    for (const sibling of cell.parentElement?.children ?? []) {
        if (sibling === cell) break;
        column += spanOf(sibling);
    }
    let at = 0;
    for (const header of headerRow.children) {
        at += spanOf(header);
        if (column < at) return textOf(header) || null;
    }
    return null;
};

// The part of a cell that shows inside its tile.
const within = (rect: DOMRect, bounds: DOMRect): DOMRect => {
    const left = Math.max(rect.left, bounds.left);
    const top = Math.max(rect.top, bounds.top);
    return new DOMRect(
        left,
        top,
        Math.max(0, Math.min(rect.right, bounds.right) - left),
        Math.max(0, Math.min(rect.bottom, bounds.bottom) - top),
    );
};

/** A pick on a table: the body cell or the column header that was hit. */
export const pickTableAt = (
    hit: Element,
    tileElement: Element,
    tile: PartTile,
): { target: CaptureTarget; rect: DOMRect } | null => {
    const cell = hit.closest('td, th');
    if (!cell || !tileElement.contains(cell)) return null;
    if (cell.getAttribute('aria-hidden') === 'true') return null;
    const row = cell.closest('tr');
    if (!row) return null;
    const rect = within(
        cell.getBoundingClientRect(),
        tileElement.getBoundingClientRect(),
    );
    const text = textOf(cell);

    if (cell.closest('thead')) {
        if (!text) return null;
        return {
            target: {
                kind: 'table-column',
                id: `${tile.uuid}/column/${indexIn(row)}/${indexIn(cell)}`,
                label: onTile(`column "${clip(text, HEADER_MAX)}"`, tile.title),
                parentId: tile.uuid,
            },
            rect,
        };
    }

    const header = headerOver(cell);
    const value = text ? `cell "${clip(text, VALUE_MAX)}"` : 'empty cell';
    const section = cell.closest('tfoot') ? 'foot' : 'body';
    return {
        target: {
            kind: 'table-cell',
            id: `${tile.uuid}/cell/${section}/${row.getAttribute('data-index') ?? indexIn(row)}/${indexIn(cell)}`,
            label: onTile(
                header
                    ? `${value} in column "${clip(header, HEADER_MAX)}"`
                    : value,
                tile.title,
            ),
            parentId: tile.uuid,
        },
        rect,
    };
};
