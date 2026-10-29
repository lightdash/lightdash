import { interpolateUiString, type UiStringResolver } from '@lightdash/common';
import { formatFieldCount, formatTileCount } from './fieldLabels';

export type LockState =
    | { hasTabs: false; isLocked: boolean }
    | { hasTabs: true; lockedTabNames: string[]; tabCount: number };

/** Null when the filter is locked nowhere. */
export const getLockSummary = (lock: LockState): string | null => {
    if (!lock.hasTabs) return lock.isLocked ? 'Locked' : null;
    const { lockedTabNames, tabCount } = lock;
    if (lockedTabNames.length === 0) return null;
    if (lockedTabNames.length === tabCount) return 'Locked';
    if (lockedTabNames.length === 1) return `Locked on ${lockedTabNames[0]}`;
    return `Locked on ${lockedTabNames.length} tabs`;
};

/** Null when the filter is not required. */
export const getRequiredSummary = (
    isRequired: boolean,
    alternativeLabels: string[],
): string | null => {
    if (!isRequired) return null;
    return alternativeLabels.length > 0
        ? `Required, or ${alternativeLabels.join(' or ')}`
        : 'Required';
};

export const getTilesSummary = (
    tileCount: number,
    fieldCount: number,
    getUiString: UiStringResolver,
) =>
    interpolateUiString(getUiString('filters.rail.tilesSummary'), {
        tiles: formatTileCount(getUiString, tileCount),
        fields: formatFieldCount(getUiString, fieldCount),
    });
