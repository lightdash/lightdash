import {
    FilterType,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';

// A control overrides N parameters of one kind. The value it sets is saved
// through the dashboard's parameter values; the control itself (label, which
// parameters it groups, which charts it skips) is session-only until a saved
// shape exists.
export type ParameterControl = {
    id: string;
    label: string;
    kind: FilterType;
    parameterKeys: string[];
    // tileUuid -> parameter key the chart is set by, false means the control
    // does not set that chart, no entry means auto (first referenced key)
    tileTargets: Record<string, string | false>;
    // Session-only viewer controls, marked "Not saved" in the sidebar
    hiddenTabUuids?: string[];
    placement?: 'bar' | 'more';
};

export type ParameterKind =
    | FilterType.STRING
    | FilterType.NUMBER
    | FilterType.DATE;

export const getParameterKind = (
    definition: LightdashProjectParameter,
): ParameterKind => {
    switch (definition.type) {
        case 'number':
            return FilterType.NUMBER;
        case 'date':
            return FilterType.DATE;
        case 'string':
        case undefined:
            return FilterType.STRING;
        default:
            return FilterType.STRING;
    }
};

export const getParameterLabel = (
    key: string,
    definitions: ParameterDefinitions,
): string => definitions[key]?.label ?? key;

type TileReferences = Record<string, string[]>;

export type KeyCount = { applied: number; possible: number };
export type ControlTabCount = { applied: number; total: number };

export const doesTileReferenceKey = (
    tile: DashboardTile,
    key: string,
    tileParameterReferences: TileReferences,
): boolean => (tileParameterReferences[tile.uuid] ?? []).includes(key);

// Keys of the control that the chart references, in control order
const getControlTileKeys = (
    control: Pick<ParameterControl, 'parameterKeys'>,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): string[] =>
    control.parameterKeys.filter((key) =>
        doesTileReferenceKey(tile, key, tileParameterReferences),
    );

const getControlDefaultTileKey = (
    control: Pick<ParameterControl, 'parameterKeys'>,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): string | null =>
    getControlTileKeys(control, tile, tileParameterReferences)[0] ?? null;

export const getControlTileKey = (
    control: ParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): string | null => {
    const target = control.tileTargets[tile.uuid];
    if (target === false) return null;
    if (
        target !== undefined &&
        control.parameterKeys.includes(target) &&
        doesTileReferenceKey(tile, target, tileParameterReferences)
    ) {
        return target;
    }
    return getControlDefaultTileKey(control, tile, tileParameterReferences);
};

export const isControlTileChanged = (
    control: ParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): boolean =>
    getControlTileKey(control, tile, tileParameterReferences) !==
    getControlDefaultTileKey(control, tile, tileParameterReferences);

export const doesControlApplyToTile = (
    control: ParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): boolean =>
    getControlTileKey(control, tile, tileParameterReferences) !== null;

// Writes the chart's key, dropping the entry when it equals the auto choice
export const setControlTileKey = (
    control: ParameterControl,
    tile: DashboardTile,
    key: string | null,
    tileParameterReferences: TileReferences,
): ParameterControl => {
    const { [tile.uuid]: _current, ...rest } = control.tileTargets;
    const auto = getControlDefaultTileKey(
        control,
        tile,
        tileParameterReferences,
    );
    if (key === auto) return { ...control, tileTargets: rest };
    return {
        ...control,
        tileTargets: { ...rest, [tile.uuid]: key === null ? false : key },
    };
};

export const applyKeyToAll = (
    control: ParameterControl,
    key: string,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): ParameterControl =>
    tiles
        .filter((tile) =>
            doesTileReferenceKey(tile, key, tileParameterReferences),
        )
        .reduce(
            (acc, tile) =>
                setControlTileKey(acc, tile, key, tileParameterReferences),
            control,
        );

// Charts set by the key stop being set by this control
export const clearKeyFromAll = (
    control: ParameterControl,
    key: string,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): ParameterControl =>
    tiles
        .filter(
            (tile) =>
                getControlTileKey(control, tile, tileParameterReferences) ===
                key,
        )
        .reduce(
            (acc, tile) =>
                setControlTileKey(acc, tile, null, tileParameterReferences),
            control,
        );

// Drops the key from the control; charts it set fall back to auto
export const removeKey = (
    control: ParameterControl,
    key: string,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): ParameterControl => {
    const next: ParameterControl = {
        ...control,
        parameterKeys: control.parameterKeys.filter((k) => k !== key),
        tileTargets: Object.fromEntries(
            Object.entries(control.tileTargets).filter(
                ([, target]) => target !== key,
            ),
        ),
    };
    return tiles.reduce((acc, tile) => {
        const target = acc.tileTargets[tile.uuid];
        if (target === undefined || target === false) return acc;
        // Re-derive so a pinned key that now equals auto drops its entry
        return setControlTileKey(acc, tile, target, tileParameterReferences);
    }, next);
};

export const getKeyCount = (
    control: ParameterControl,
    key: string,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): KeyCount => ({
    possible: tiles.filter((tile) =>
        doesTileReferenceKey(tile, key, tileParameterReferences),
    ).length,
    applied: tiles.filter(
        (tile) =>
            getControlTileKey(control, tile, tileParameterReferences) === key,
    ).length,
});

export const getControlCount = (
    control: ParameterControl,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): KeyCount => ({
    possible: tiles.filter((tile) =>
        control.parameterKeys.some((key) =>
            doesTileReferenceKey(tile, key, tileParameterReferences),
        ),
    ).length,
    applied: tiles.filter((tile) =>
        doesControlApplyToTile(control, tile, tileParameterReferences),
    ).length,
});

const countTabs = (
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    isPossible: (tile: DashboardTile) => boolean,
    isApplied: (tile: DashboardTile) => boolean,
): Record<string, ControlTabCount> =>
    Object.fromEntries(
        tabs.map((tab) => {
            const tabTiles = tiles.filter((tile) => tile.tabUuid === tab.uuid);
            return [
                tab.uuid,
                {
                    total: tabTiles.length,
                    applied: tabTiles.filter(
                        (tile) => isPossible(tile) && isApplied(tile),
                    ).length,
                },
            ];
        }),
    );

export const getControlTabCounts = (
    control: ParameterControl,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    tileParameterReferences: TileReferences,
): Record<string, ControlTabCount> =>
    countTabs(
        tiles,
        tabs,
        (tile) =>
            getControlTileKeys(control, tile, tileParameterReferences).length >
            0,
        (tile) =>
            doesControlApplyToTile(control, tile, tileParameterReferences),
    );

export const getControlTabCountsForKey = (
    control: ParameterControl,
    key: string,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    tileParameterReferences: TileReferences,
): Record<string, ControlTabCount> =>
    countTabs(
        tiles,
        tabs,
        (tile) => doesTileReferenceKey(tile, key, tileParameterReferences),
        (tile) =>
            getControlTileKey(control, tile, tileParameterReferences) === key,
    );

const getParameterKeysUsedOnDashboard = (
    tileParameterReferences: Record<string, string[]>,
): string[] => [...new Set(Object.values(tileParameterReferences).flat())];

// Parameters of the control's kind that no control overrides yet
export const getFreeParameterKeys = (
    kind: ParameterKind,
    controls: ParameterControl[],
    definitions: ParameterDefinitions,
    tileParameterReferences: Record<string, string[]>,
): string[] => {
    const taken = new Set(controls.flatMap((control) => control.parameterKeys));
    return getParameterKeysUsedOnDashboard(tileParameterReferences).filter(
        (key) => {
            const definition = definitions[key];
            return (
                definition !== undefined &&
                !taken.has(key) &&
                getParameterKind(definition) === kind
            );
        },
    );
};

// A dashboard saved today keeps one control per saved parameter value
export const getControlsFromSavedValues = (
    savedValues: ParametersValuesMap,
    definitions: ParameterDefinitions,
): ParameterControl[] =>
    Object.keys(savedValues)
        .filter((key) => definitions[key] !== undefined)
        .map((key) => ({
            id: `saved-${key}`,
            label: getParameterLabel(key, definitions),
            kind: getParameterKind(definitions[key]),
            parameterKeys: [key],
            tileTargets: {},
        }));

export const getControlValue = (
    control: ParameterControl,
    parameterValues: ParametersValuesMap,
) => {
    const [first] = control.parameterKeys;
    return first === undefined ? undefined : parameterValues[first];
};
