import {
    HOMEPAGE_MAX_BLOCKS_PER_ROW,
    type HomepageBlock,
    type HomepageCollectionItemRef,
    type HomepageConfig,
    type HomepageRow,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

type BlockLocation = { rowIndex: number; blockIndex: number };

const findBlock = (
    config: HomepageConfig,
    blockId: string,
): BlockLocation | undefined => {
    for (let rowIndex = 0; rowIndex < config.rows.length; rowIndex += 1) {
        const blockIndex = config.rows[rowIndex].blocks.findIndex(
            (b) => b.id === blockId,
        );
        if (blockIndex >= 0) return { rowIndex, blockIndex };
    }
    return undefined;
};

const withRows = (
    config: HomepageConfig,
    rows: HomepageRow[],
): HomepageConfig => ({
    ...config,
    rows: rows.filter((row) => row.blocks.length > 0),
});

const cloneRows = (config: HomepageConfig): HomepageRow[] =>
    config.rows.map((row) => ({ ...row, blocks: [...row.blocks] }));

const newRowOf = (blocks: HomepageBlock[]): HomepageRow => ({
    id: uuidv4(),
    blocks,
});

export const addBlock = (
    config: HomepageConfig,
    block: HomepageBlock,
): HomepageConfig => withRows(config, [...config.rows, newRowOf([block])]);

export const removeBlock = (
    config: HomepageConfig,
    blockId: string,
): HomepageConfig => {
    const location = findBlock(config, blockId);
    if (!location) return config;
    const rows = cloneRows(config);
    rows[location.rowIndex].blocks.splice(location.blockIndex, 1);
    return withRows(config, rows);
};

export const duplicateBlock = (
    config: HomepageConfig,
    blockId: string,
): HomepageConfig => {
    const location = findBlock(config, blockId);
    if (!location) return config;
    const rows = cloneRows(config);
    const original = rows[location.rowIndex].blocks[location.blockIndex];
    const copy: HomepageBlock = structuredClone(original);
    copy.id = uuidv4();
    if (rows[location.rowIndex].blocks.length < HOMEPAGE_MAX_BLOCKS_PER_ROW) {
        rows[location.rowIndex].blocks.splice(location.blockIndex + 1, 0, copy);
    } else {
        rows.splice(location.rowIndex + 1, 0, newRowOf([copy]));
    }
    return withRows(config, rows);
};

const moveBlock = (
    config: HomepageConfig,
    blockId: string,
    direction: -1 | 1,
): HomepageConfig => {
    const location = findBlock(config, blockId);
    if (!location) return config;
    const rows = cloneRows(config);
    const row = rows[location.rowIndex];
    const [block] = row.blocks.splice(location.blockIndex, 1);
    if (row.blocks.length > 0) {
        // extract from a multi-block row into its own adjacent row
        const insertAt =
            direction === -1 ? location.rowIndex : location.rowIndex + 1;
        rows.splice(insertAt, 0, newRowOf([block]));
        return withRows(config, rows);
    }
    // single-block row: swap with the adjacent row
    const targetIndex = location.rowIndex + direction;
    if (targetIndex < 0 || targetIndex >= rows.length) {
        return config;
    }
    row.blocks.push(block);
    [rows[location.rowIndex], rows[targetIndex]] = [
        rows[targetIndex],
        rows[location.rowIndex],
    ];
    return withRows(config, rows);
};

export const moveBlockUp = (
    config: HomepageConfig,
    blockId: string,
): HomepageConfig => moveBlock(config, blockId, -1);

export const moveBlockDown = (
    config: HomepageConfig,
    blockId: string,
): HomepageConfig => moveBlock(config, blockId, 1);

export const canMoveUp = (config: HomepageConfig, blockId: string): boolean => {
    const location = findBlock(config, blockId);
    if (!location) return false;
    const row = config.rows[location.rowIndex];
    return row.blocks.length > 1 || location.rowIndex > 0;
};

export const canMoveDown = (
    config: HomepageConfig,
    blockId: string,
): boolean => {
    const location = findBlock(config, blockId);
    if (!location) return false;
    const row = config.rows[location.rowIndex];
    return row.blocks.length > 1 || location.rowIndex < config.rows.length - 1;
};

export type DropTarget =
    | { kind: 'row'; rowIndex: number }
    | { kind: 'cell'; rowIndex: number; blockIndex: number }
    | { kind: 'end' };

const insertAt = (
    rows: HomepageRow[],
    block: HomepageBlock,
    target: DropTarget,
): HomepageRow[] => {
    switch (target.kind) {
        case 'end':
            rows.push(newRowOf([block]));
            return rows;
        case 'row':
            rows.splice(target.rowIndex, 0, newRowOf([block]));
            return rows;
        case 'cell': {
            const row = rows[target.rowIndex];
            if (!row || row.blocks.length >= HOMEPAGE_MAX_BLOCKS_PER_ROW) {
                return rows;
            }
            row.blocks.splice(target.blockIndex, 0, block);
            return rows;
        }
        default:
            return rows;
    }
};

export const dropNewBlock = (
    config: HomepageConfig,
    block: HomepageBlock,
    target: DropTarget,
): HomepageConfig =>
    withRows(config, insertAt(cloneRows(config), block, target));

export const dropExistingBlock = (
    config: HomepageConfig,
    blockId: string,
    target: DropTarget,
): HomepageConfig => {
    const location = findBlock(config, blockId);
    if (!location) return config;
    if (
        target.kind === 'cell' &&
        target.rowIndex === location.rowIndex &&
        (target.blockIndex === location.blockIndex ||
            target.blockIndex === location.blockIndex + 1)
    ) {
        return config; // dropping beside itself is a no-op
    }
    const rows = cloneRows(config);
    const sourceRow = rows[location.rowIndex];
    const [block] = sourceRow.blocks.splice(location.blockIndex, 1);
    const sourceRowEmptied = sourceRow.blocks.length === 0;

    const adjusted: DropTarget = (() => {
        if (target.kind === 'end') return target;
        let { rowIndex } = target;
        if (sourceRowEmptied && rowIndex > location.rowIndex) rowIndex -= 1;
        if (target.kind === 'row') return { kind: 'row', rowIndex };
        let { blockIndex } = target;
        if (
            rowIndex === location.rowIndex &&
            !sourceRowEmptied &&
            blockIndex > location.blockIndex
        ) {
            blockIndex -= 1;
        }
        return { kind: 'cell', rowIndex, blockIndex };
    })();

    if (sourceRowEmptied) rows.splice(location.rowIndex, 1);
    return withRows(config, insertAt(rows, block, adjusted));
};

// Whether a row can take another column (used to gate the explicit
// add-column gutter affordances).
export const canAddColumn = (
    config: HomepageConfig,
    rowIndex: number,
): boolean => {
    const row = config.rows[rowIndex];
    return !!row && row.blocks.length < HOMEPAGE_MAX_BLOCKS_PER_ROW;
};

export const canDropInRow = (
    config: HomepageConfig,
    rowIndex: number,
    draggedBlockId?: string,
): boolean => {
    const row = config.rows[rowIndex];
    if (!row) return false;
    const isSameRow =
        draggedBlockId !== undefined &&
        row.blocks.some((block) => block.id === draggedBlockId);
    return isSameRow || row.blocks.length < HOMEPAGE_MAX_BLOCKS_PER_ROW;
};

export const replaceBlock = (
    config: HomepageConfig,
    updated: HomepageBlock,
): HomepageConfig => {
    const location = findBlock(config, updated.id);
    if (!location) return config;
    const rows = cloneRows(config);
    rows[location.rowIndex].blocks[location.blockIndex] = updated;
    return withRows(config, rows);
};

// Keyed by uuid, not visible index: refs hidden by access filtering keep their slot.
export const reorderCollectionItems = (
    items: HomepageCollectionItemRef[],
    activeUuid: string,
    overUuid: string,
): HomepageCollectionItemRef[] => {
    const from = items.findIndex((item) => item.uuid === activeUuid);
    const to = items.findIndex((item) => item.uuid === overUuid);
    if (from === -1 || to === -1 || from === to) return items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
};
