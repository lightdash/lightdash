import {
    assertUnreachable,
    DashboardTileParameterSource,
    getDashboardTileParameterSource,
    resolveParameterDefault,
    type DashboardParameterControl,
    type LightdashProjectParameter,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

// The parameters a tile's chart references
export type ParameterTile = {
    tileUuid: string;
    // null while the tile has not reported its references yet
    parameterKeys: string[] | null;
};

const keysOf = (tile: ParameterTile): string[] => tile.parameterKeys ?? [];

// Mappings are only safe to write once every tile's references are known
export const hasUnknownParameterReferences = (
    tiles: ParameterTile[],
): boolean => tiles.some((tile) => tile.parameterKeys === null);

export const getControlForKey = (
    controls: DashboardParameterControl[],
    key: string,
): DashboardParameterControl | undefined =>
    controls.find((control) => control.parameterKeys.includes(key));

// What a control is called: its label, else its first parameter's
export const getControlLabel = (
    control: DashboardParameterControl,
    definitions: ParameterDefinitions,
): string => {
    const firstKey = control.parameterKeys[0];
    return (
        control.label ||
        (firstKey !== undefined
            ? definitions[firstKey]?.label || firstKey
            : 'New control')
    );
};

// Dashboards never saved from the controls surface: one control per parameter
// that has a saved dashboard value or is pinned, with no tile taken out
export const getDerivedParameterControls = ({
    savedValueKeys,
    pinnedKeys,
    definitions,
}: {
    savedValueKeys: string[];
    pinnedKeys: string[];
    definitions: ParameterDefinitions;
}): DashboardParameterControl[] =>
    [...new Set([...pinnedKeys, ...savedValueKeys])].map((key) => ({
        id: `parameter:${key}`,
        label: definitions[key]?.label || key,
        parameterKeys: [key],
        tileTargets: {},
    }));

export type ParameterType = NonNullable<LightdashProjectParameter['type']>;

export const getParameterType = (
    definition: LightdashProjectParameter | undefined,
): ParameterType => definition?.type ?? 'string';

// Parameters of one type that no other control sets
export const getFreeKeysOfType = ({
    controlId,
    controls,
    definitions,
    candidateKeys,
    type,
}: {
    controlId: string;
    controls: DashboardParameterControl[];
    definitions: ParameterDefinitions;
    candidateKeys: string[];
    type: ParameterType;
}): string[] =>
    candidateKeys.filter((key) => {
        const owner = getControlForKey(controls, key);
        if (owner && owner.id !== controlId) return false;
        return getParameterType(definitions[key]) === type;
    });

// The types of the parameters no control sets yet, one per parameter; null
// while a tile has not reported the parameters it uses
export const getFreeParameterTypes = ({
    tiles,
    controls,
    definitions,
}: {
    tiles: ParameterTile[];
    controls: DashboardParameterControl[];
    definitions: ParameterDefinitions;
}): ParameterType[] | null =>
    hasUnknownParameterReferences(tiles)
        ? null
        : [...new Set(tiles.flatMap((tile) => keysOf(tile)))]
              .filter((key) => !getControlForKey(controls, key))
              .map((key) => getParameterType(definitions[key]));

// What one tile's own select offers. A tile is in or out of a control as a
// whole, so a tile that references one of the control's parameters can only
// take that one; other tiles can start from a parameter no control has.
export const getTileParameterOptions = (
    control: DashboardParameterControl,
    tile: ParameterTile,
    freeKeys: string[],
): string[] => {
    const ownKey = control.parameterKeys.find((key) =>
        keysOf(tile).includes(key),
    );
    return ownKey !== undefined
        ? [ownKey]
        : freeKeys.filter((key) => !control.parameterKeys.includes(key));
};

// The parameter a tile takes the control's value through, if any
export const getControlTileKey = (
    control: DashboardParameterControl,
    tile: ParameterTile,
): string | null => {
    if (control.tileTargets[tile.tileUuid] === false) return null;
    return (
        control.parameterKeys.find((key) => keysOf(tile).includes(key)) ?? null
    );
};

const withoutTiles = (
    tileTargets: Record<string, false>,
    tileUuids: string[],
): Record<string, false> =>
    Object.fromEntries(
        Object.entries(tileTargets).filter(
            ([tileUuid]) => !tileUuids.includes(tileUuid),
        ),
    );

const offForTiles = (tileUuids: string[]): Record<string, false> =>
    Object.fromEntries(tileUuids.map((tileUuid) => [tileUuid, false as const]));

// Maps tiles to a parameter. A parameter new to the control is added to it,
// and every other tile that references it and was not mapped is saved as off.
// Nothing is written while any tile's references are unknown.
export const mapParameterTiles = (
    control: DashboardParameterControl,
    tileUuids: string[],
    key: string,
    tiles: ParameterTile[],
): DashboardParameterControl => {
    if (hasUnknownParameterReferences(tiles)) return control;
    const isKnown = control.parameterKeys.includes(key);
    const othersToTakeOut = isKnown
        ? []
        : tiles
              .filter(
                  (tile) =>
                      !tileUuids.includes(tile.tileUuid) &&
                      keysOf(tile).includes(key) &&
                      getControlTileKey(control, tile) === null,
              )
              .map((tile) => tile.tileUuid);
    return {
        ...control,
        parameterKeys: isKnown
            ? control.parameterKeys
            : [...control.parameterKeys, key],
        tileTargets: {
            ...withoutTiles(control.tileTargets, tileUuids),
            ...offForTiles(othersToTakeOut),
        },
    };
};

// Takes tiles out. Each is recorded as taken out, also the last tile that
// uses one of the control's parameters: the parameter stays in the control,
// so the dashboard's value for it does not reach the tile. Only removing the
// parameter drops it. Nothing is written while any tile's references are
// unknown.
export const unmapParameterTiles = (
    control: DashboardParameterControl,
    tileUuids: string[],
    tiles: ParameterTile[],
): DashboardParameterControl => {
    if (hasUnknownParameterReferences(tiles)) return control;
    return {
        ...control,
        tileTargets: { ...control.tileTargets, ...offForTiles(tileUuids) },
    };
};

// A duplicated tile is taken out of the controls its source is taken out of.
// `tileUuidMapping` maps each new tile uuid to the tile it was copied from.
export const copyParameterControlTileTargets = (
    controls: DashboardParameterControl[],
    tileUuidMapping: Record<string, string>,
): DashboardParameterControl[] => {
    const copies = Object.entries(tileUuidMapping);
    let hasChanged = false;
    const next = controls.map((control) => {
        const added = copies.filter(
            ([newUuid, sourceUuid]) =>
                control.tileTargets[sourceUuid] === false &&
                control.tileTargets[newUuid] !== false,
        );
        if (added.length === 0) return control;
        hasChanged = true;
        return {
            ...control,
            tileTargets: {
                ...control.tileTargets,
                ...offForTiles(added.map(([newUuid]) => newUuid)),
            },
        };
    });
    return hasChanged ? next : controls;
};

// A control with no parameter exists only while it is being edited
export const withoutEmptyParameterControls = (
    controls: DashboardParameterControl[],
): DashboardParameterControl[] =>
    controls.filter((control) => control.parameterKeys.length > 0);

// Whether unsaved controls differ from the saved (or derived) ones by value
export const haveParameterControlsChanged = (
    edited: DashboardParameterControl[] | null,
    baseline: DashboardParameterControl[],
): boolean =>
    edited !== null &&
    !isEqual(
        withoutEmptyParameterControls(edited),
        withoutEmptyParameterControls(baseline),
    );

// Tiles that reference the parameter and do not take the control's value
const getUnmappedTilesWithKey = (
    control: DashboardParameterControl,
    key: string,
    tiles: ParameterTile[],
): string[] =>
    tiles
        .filter(
            (tile) =>
                keysOf(tile).includes(key) &&
                getControlTileKey(control, tile) === null,
        )
        .map((tile) => tile.tileUuid);

// Maps every tile that references the parameter and is not mapped to anything
export const addParameterKey = (
    control: DashboardParameterControl,
    key: string,
    tiles: ParameterTile[],
): DashboardParameterControl => {
    const tileUuids = getUnmappedTilesWithKey(control, key, tiles);
    return tileUuids.length === 0
        ? control
        : mapParameterTiles(control, tileUuids, key, tiles);
};

// Takes the parameter out of the control. Tiles that reference another of its
// parameters stay; the "off" entries the parameter no longer needs go.
export const removeParameterKey = (
    control: DashboardParameterControl,
    key: string,
    tiles: ParameterTile[],
): DashboardParameterControl => {
    if (hasUnknownParameterReferences(tiles)) return control;
    const parameterKeys = control.parameterKeys.filter((k) => k !== key);
    const unneeded = tiles
        .filter(
            (tile) =>
                control.tileTargets[tile.tileUuid] === false &&
                !keysOf(tile).some((k) => parameterKeys.includes(k)),
        )
        .map((tile) => tile.tileUuid);
    return {
        ...control,
        parameterKeys,
        tileTargets: withoutTiles(control.tileTargets, unneeded),
    };
};

// Whether a tile's change of side only reaches its query once the dashboard
// is saved. Putting back a tile whose take-out is saved does: the server
// keeps the saved take-out until then. A new take-out reaches the query at
// once, unless the tile has no value of its own to run with.
export const getIsAppliedOnSave = ({
    isSavedTakenOut,
    isTakenOut,
    hasOwnValue,
}: {
    isSavedTakenOut: boolean;
    isTakenOut: boolean;
    // The chart has a saved value for the parameter, or it has a default
    hasOwnValue: boolean;
}): boolean => {
    if (isSavedTakenOut === isTakenOut) return false;
    return isSavedTakenOut || !hasOwnValue;
};

export type TileParameterValueSource =
    | 'dashboard'
    | 'default'
    | 'chart'
    | 'missing';

export type TileParameterValue = {
    value: ParameterValue | undefined;
    source: TileParameterValueSource;
};

// The value one tile runs with for one parameter, and where it comes from
export const resolveTileParameterValue = ({
    key,
    takenOutKeys,
    dashboardValues,
    chartSavedValues,
    definitions,
}: {
    key: string;
    takenOutKeys: string[];
    dashboardValues: ParametersValuesMap;
    chartSavedValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
}): TileParameterValue => {
    const source = getDashboardTileParameterSource({
        key,
        definitions,
        dashboardValues,
        chartSavedValues,
        isTargeted: true,
        takenOutKeys,
    });
    switch (source) {
        case DashboardTileParameterSource.DASHBOARD:
            return { value: dashboardValues[key], source: 'dashboard' };
        case DashboardTileParameterSource.CHART:
            return { value: chartSavedValues[key], source: 'chart' };
        case DashboardTileParameterSource.DEFAULT: {
            const definition = definitions[key];
            const value = definition
                ? resolveParameterDefault(definition)
                : undefined;
            return value === undefined
                ? { value: undefined, source: 'missing' }
                : { value, source: 'default' };
        }
        default:
            return assertUnreachable(source, 'Unknown parameter source');
    }
};

export const formatTileParameterValue = ({
    value,
    source,
}: TileParameterValue): string => {
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    switch (source) {
        case 'dashboard':
            return text;
        case 'default':
            return `${text} (default)`;
        case 'chart':
            return `${text} (from chart)`;
        case 'missing':
            return 'Missing parameters';
        default:
            return assertUnreachable(source, 'Unknown parameter source');
    }
};

const MISSING_PARAMETERS_PREFIX = 'Missing parameters: ';

// The parameter keys named by a tile's "Missing parameters" error
export const getMissingParameterKeys = (
    errorMessage: string | undefined,
): string[] =>
    errorMessage?.startsWith(MISSING_PARAMETERS_PREFIX)
        ? errorMessage
              .slice(MISSING_PARAMETERS_PREFIX.length)
              .split(',')
              .map((key) => key.trim())
              .filter((key) => key.length > 0)
        : [];
