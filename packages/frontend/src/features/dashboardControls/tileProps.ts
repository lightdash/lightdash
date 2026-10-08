import { shallowEqual } from '@mantine/hooks';

export type TileHighlight = 'mapped' | 'available' | 'reached';

// For memoised per-tile components: props are equal when each one is the same
// value, or an array with the same items
export const areTilePropsEqual = <Props extends object>(
    previous: Props,
    next: Props,
): boolean =>
    (Object.keys(next) as (keyof Props)[]).every((key) => {
        const before = previous[key];
        const after = next[key];
        return (
            Object.is(before, after) ||
            (Array.isArray(before) &&
                Array.isArray(after) &&
                shallowEqual(before, after))
        );
    });
