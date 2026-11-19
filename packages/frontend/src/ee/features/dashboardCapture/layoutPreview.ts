import { type CaptureLayoutOp } from '@lightdash/common';
import { applyLayoutOps, type LayoutTile } from './applyLayoutOps';

/** True when both lists hold the same tiles in the same places. */
export const hasSameLayout = (a: LayoutTile[], b: LayoutTile[]): boolean => {
    if (a.length !== b.length) return false;
    const byUuid = new Map(b.map((tile) => [tile.uuid, tile]));
    return a.every((tile) => {
        const other = byUuid.get(tile.uuid);
        return (
            other !== undefined &&
            tile.x === other.x &&
            tile.y === other.y &&
            tile.w === other.w &&
            tile.h === other.h &&
            (tile.tabUuid ?? null) === (other.tabUuid ?? null)
        );
    });
};

/**
 * Puts an unsaved layout preview back on tiles freshly loaded from the server.
 * Changes whose tile is gone are dropped; `ops` is what is still pending.
 */
export const reapplyLayoutPreview = <T extends LayoutTile>(
    serverTiles: T[],
    pendingOps: CaptureLayoutOp[],
    columns: number,
): { tiles: T[]; ops: CaptureLayoutOp[] } => {
    const uuids = new Set(serverTiles.map((tile) => tile.uuid));
    const ops = pendingOps.filter(
        (op) =>
            uuids.has(op.tileUuid) &&
            (op.type !== 'swap' || uuids.has(op.withTileUuid)),
    );
    const { tiles } = applyLayoutOps(serverTiles, ops, columns);
    return hasSameLayout(tiles, serverTiles)
        ? { tiles: serverTiles, ops: [] }
        : { tiles, ops };
};
