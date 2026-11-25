/** Bubble ids from back to front: known ones in their order, new ones on top. */
export const stackOrder = (order: string[], ids: string[]): string[] => [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
];

/** The order with one bubble moved to the front; the same array when it is there already. */
export const bringToFront = (order: string[], id: string): string[] =>
    order[order.length - 1] === id
        ? order
        : [...order.filter((other) => other !== id), id];
