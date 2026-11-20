import { type CaptureLayoutOp } from '@lightdash/common';

export type LayoutTile = {
    uuid: string;
    x: number;
    y: number;
    w: number;
    h: number;
    tabUuid: string | null | undefined;
};

type Box = Pick<LayoutTile, 'x' | 'y' | 'w' | 'h'>;

const overlaps = (a: Box, b: Box): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const byPosition = (a: LayoutTile, b: LayoutTile): number =>
    a.y - b.y || a.x - b.x;

const sameLayout = (a: LayoutTile[], b: LayoutTile[]): boolean =>
    a.every((tile, i) => {
        const other = b[i];
        return (
            tile.x === other.x &&
            tile.y === other.y &&
            tile.w === other.w &&
            tile.h === other.h
        );
    });

/**
 * Settles one tab after some tiles were placed on purpose: the placed tiles
 * keep their spot, anything they land on moves below them, then every tile
 * rises as far as it can, the way the dashboard grid packs tiles.
 */
const settle = <T extends LayoutTile>(tiles: T[], placed: Set<string>): T[] => {
    const fixed: LayoutTile[] = tiles.filter((tile) => placed.has(tile.uuid));
    const moved = new Map<string, LayoutTile>(
        fixed.map((tile) => [tile.uuid, tile]),
    );
    for (const tile of tiles
        .filter((t) => !placed.has(t.uuid))
        .sort(byPosition)) {
        let next: LayoutTile = tile;
        let blocker = fixed.find((other) => overlaps(next, other));
        while (blocker) {
            next = { ...next, y: blocker.y + blocker.h };
            const candidate = next;
            blocker = fixed.find((other) => overlaps(candidate, other));
        }
        fixed.push(next);
        moved.set(next.uuid, next);
    }

    const packed: LayoutTile[] = [];
    for (const tile of [...moved.values()].sort(byPosition)) {
        let next = tile;
        while (next.y > 0) {
            const candidate = { ...next, y: next.y - 1 };
            if (packed.some((other) => overlaps(candidate, other))) break;
            next = candidate;
        }
        packed.push(next);
        moved.set(next.uuid, next);
    }

    return tiles.map((tile) => ({ ...tile, ...moved.get(tile.uuid) }));
};

/** Applies layout changes to dashboard tiles, one tab at a time. */
export const applyLayoutOps = <T extends LayoutTile>(
    tiles: T[],
    ops: CaptureLayoutOp[],
    columns: number,
): { tiles: T[]; applied: number } => {
    let current = tiles;
    let applied = 0;

    for (const op of ops) {
        const target = current.find((tile) => tile.uuid === op.tileUuid);
        const partner =
            op.type === 'swap'
                ? current.find((tile) => tile.uuid === op.withTileUuid)
                : undefined;
        const tab = target?.tabUuid ?? null;
        const partnerOnSameTab =
            partner !== undefined && (partner.tabUuid ?? null) === tab;

        if (target && (op.type !== 'swap' || partnerOnSameTab)) {
            const placed = new Set<string>([target.uuid]);
            const changed = new Map<string, Box>();
            if (op.type === 'move') {
                changed.set(target.uuid, {
                    x: Math.min(Math.max(0, op.x), columns - target.w),
                    y: Math.max(0, op.y),
                    w: target.w,
                    h: target.h,
                });
            } else if (op.type === 'resize') {
                changed.set(target.uuid, {
                    x: target.x,
                    y: target.y,
                    w: Math.min(Math.max(1, op.w), columns - target.x),
                    h: Math.max(1, op.h),
                });
            } else if (partner) {
                placed.add(partner.uuid);
                const { x, y, w, h } = target;
                changed.set(target.uuid, {
                    x: partner.x,
                    y: partner.y,
                    w: partner.w,
                    h: partner.h,
                });
                changed.set(partner.uuid, { x, y, w, h });
            }

            const onTab = current
                .filter((tile) => (tile.tabUuid ?? null) === tab)
                .map((tile) => ({ ...tile, ...changed.get(tile.uuid) }));
            const settled = settle(onTab, placed);
            const before = current.filter(
                (tile) => (tile.tabUuid ?? null) === tab,
            );
            if (!sameLayout(before, settled)) {
                const byUuid = new Map(settled.map((t) => [t.uuid, t]));
                current = current.map((tile) => byUuid.get(tile.uuid) ?? tile);
                applied += 1;
            }
        }
    }

    return { tiles: current, applied };
};
