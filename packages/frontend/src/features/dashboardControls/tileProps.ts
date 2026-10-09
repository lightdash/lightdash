import { shallowEqual } from '@mantine/hooks';

// mapped: on the control (and on the active field, when there is one).
// other: on the control through another field than the active one.
// available: reachable, but not on the control
export type TileHighlight = 'mapped' | 'other' | 'available';

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
