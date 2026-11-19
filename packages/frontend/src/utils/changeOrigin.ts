import {
    isAction,
    type Middleware,
    type UnknownAction,
} from '@reduxjs/toolkit';

/** Where a dispatched change came from, which is all undo history needs to know about it */
export type ChangeOrigin = {
    /** Follows from data or an earlier edit, so it never starts an undo step */
    isDerived: boolean;
    /** Shared by everything dispatched in one browser task: one user action */
    gesture: number;
};

let derivedDepth = 0;
let gesture = 0;
let isGestureOpen = false;

/** The id of the browser task running now */
export const currentGesture = (): number => {
    if (!isGestureOpen) {
        isGestureOpen = true;
        gesture += 1;
        setTimeout(() => {
            isGestureOpen = false;
        }, 0);
    }
    return gesture;
};

/** Runs dispatches that react to data rather than to the user: an effect seeding a default, a chart repairing its config */
export const derived = <T>(run: () => T): T => {
    derivedDepth += 1;
    try {
        return run();
    } finally {
        derivedDepth -= 1;
    }
};

type WithOrigin = UnknownAction & { meta: { origin: ChangeOrigin } };

const hasOrigin = (action: UnknownAction): action is WithOrigin => {
    const { meta } = action;
    return typeof meta === 'object' && meta !== null && 'origin' in meta;
};

/** Null for an action no store stamped, such as one handed straight to a reducer */
export const changeOriginOf = (action: UnknownAction): ChangeOrigin | null =>
    hasOrigin(action) ? action.meta.origin : null;

export const withChangeOrigin = <A extends UnknownAction>(
    action: A,
    origin: ChangeOrigin,
): A => ({
    ...action,
    meta: {
        ...(typeof action.meta === 'object' ? action.meta : null),
        origin,
    },
});

/** Stamps every action with its origin, keeping the reducers that read it pure */
export const stampChangeOrigin: Middleware = () => (next) => (action) =>
    next(
        isAction(action)
            ? withChangeOrigin(action, {
                  isDerived: derivedDepth > 0,
                  gesture: currentGesture(),
              })
            : action,
    );
