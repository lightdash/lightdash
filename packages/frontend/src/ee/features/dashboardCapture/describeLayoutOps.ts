import { type CaptureLayoutOp } from '@lightdash/common';

/** Layout changes in plain words, for telling the agent what the page did. */
export const describeLayoutOps = (
    ops: CaptureLayoutOp[],
    titles: Map<string, string>,
): string => {
    const name = (uuid: string) => `"${titles.get(uuid) ?? 'a tile'}"`;
    return ops
        .map((op) => {
            switch (op.type) {
                case 'swap':
                    return `swapped ${name(op.tileUuid)} and ${name(op.withTileUuid)}`;
                case 'move':
                    return `moved ${name(op.tileUuid)} to column ${op.x}, row ${op.y}`;
                case 'resize':
                    return `resized ${name(op.tileUuid)} to ${op.w} columns by ${op.h} rows`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('; ');
};
