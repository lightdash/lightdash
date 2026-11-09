import {
    getFirstCollision,
    sortLayoutItemsByRowCol,
    type Compactor,
    type Layout,
    type LayoutItem,
} from 'react-grid-layout';

const pushBelowCollisions = (placed: Layout, item: LayoutItem): LayoutItem => {
    const collision = getFirstCollision(placed, item);
    return collision
        ? pushBelowCollisions(placed, { ...item, y: collision.y + collision.h })
        : item;
};

/**
 * Keeps tiles where they were saved (no upward compaction) but never lets them
 * overlap: a tile dragged or resized into another pushes it down. This is what
 * react-grid-layout 1.x did for `compactType: null`; 2.x's `noCompactor` skips
 * collision resolution entirely.
 */
export const keepPositionsCompactor: Compactor = {
    type: null,
    allowOverlap: false,
    compact: (layout) => {
        const placed = sortLayoutItemsByRowCol(layout).reduce<LayoutItem[]>(
            (acc, item) =>
                item.static
                    ? acc
                    : [
                          ...acc,
                          pushBelowCollisions(acc, {
                              ...item,
                              x: Math.max(item.x, 0),
                              y: Math.max(item.y, 0),
                              moved: false,
                          }),
                      ],
            layout.filter((item) => item.static),
        );
        const byId = new Map(placed.map((item) => [item.i, item]));
        return layout.map((item) => byId.get(item.i) ?? item);
    },
};
