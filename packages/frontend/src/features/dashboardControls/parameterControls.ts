import {
    FilterType,
    isDashboardParameterSetOnTile,
    type DashboardParameterControl,
    type DashboardTab,
    type DashboardTile,
    type LightdashProjectParameter,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

export type ParameterKind =
    | FilterType.STRING
    | FilterType.NUMBER
    | FilterType.DATE;

// null means no entry (every parameter), false switches the tile off, a string is one parameter key
export type ControlTileTarget = null | false | string;

export type KeyCount = { applied: number; possible: number };
export type ControlTabCount = { applied: number; total: number };

type TileReferences = Record<string, string[]>;

export const getParameterKind = (
    definition: LightdashProjectParameter,
): ParameterKind => {
    switch (definition.type) {
        case 'number':
            return FilterType.NUMBER;
        case 'date':
            return FilterType.DATE;
        default:
            return FilterType.STRING;
    }
};

export const getParameterLabel = (
    key: string,
    definitions: ParameterDefinitions,
): string => definitions[key]?.label ?? key;

const doesTileReferenceKey = (
    tile: DashboardTile,
    key: string,
    tileParameterReferences: TileReferences,
): boolean => (tileParameterReferences[tile.uuid] ?? []).includes(key);

// Keys of the control this tile references, in control order
export const getControlKeysOnTile = (
    control: DashboardParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): string[] =>
    control.parameterKeys.filter((key) =>
        doesTileReferenceKey(tile, key, tileParameterReferences),
    );

// Keys the control actually sets on this tile
export const getControlKeysSetOnTile = (
    control: DashboardParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): string[] =>
    getControlKeysOnTile(control, tile, tileParameterReferences).filter((key) =>
        isDashboardParameterSetOnTile({
            key,
            parameterControls: [control],
            tileUuid: tile.uuid,
        }),
    );

// A target naming a key the control no longer holds counts as no entry
export const getControlTileTarget = (
    control: DashboardParameterControl,
    tileUuid: string,
): ControlTileTarget => {
    const target = control.tileTargets[tileUuid];
    if (target === false) return false;
    if (target === undefined || !control.parameterKeys.includes(target)) {
        return null;
    }
    return target;
};

export const setControlTileTarget = (
    control: DashboardParameterControl,
    tileUuid: string,
    target: ControlTileTarget,
): DashboardParameterControl => {
    const { [tileUuid]: _current, ...rest } = control.tileTargets;
    return {
        ...control,
        tileTargets: target === null ? rest : { ...rest, [tileUuid]: target },
    };
};

export const addControlKey = (
    control: DashboardParameterControl,
    key: string,
): DashboardParameterControl =>
    control.parameterKeys.includes(key)
        ? control
        : { ...control, parameterKeys: [...control.parameterKeys, key] };

// Tiles narrowed to the removed key go back to no entry
export const removeControlKey = (
    control: DashboardParameterControl,
    key: string,
): DashboardParameterControl => ({
    ...control,
    parameterKeys: control.parameterKeys.filter(
        (candidate) => candidate !== key,
    ),
    tileTargets: Object.fromEntries(
        Object.entries(control.tileTargets).filter(
            ([, target]) => target !== key,
        ),
    ),
});

const isKeySetOnTile = (
    control: DashboardParameterControl,
    key: string,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): boolean =>
    getControlKeysSetOnTile(control, tile, tileParameterReferences).includes(
        key,
    );

const isControlSetOnTile = (
    control: DashboardParameterControl,
    tile: DashboardTile,
    tileParameterReferences: TileReferences,
): boolean =>
    getControlKeysSetOnTile(control, tile, tileParameterReferences).length > 0;

export const getKeyCount = (
    control: DashboardParameterControl,
    key: string,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): KeyCount => ({
    possible: tiles.filter((tile) =>
        doesTileReferenceKey(tile, key, tileParameterReferences),
    ).length,
    applied: tiles.filter((tile) =>
        isKeySetOnTile(control, key, tile, tileParameterReferences),
    ).length,
});

export const getControlCount = (
    control: DashboardParameterControl,
    tiles: DashboardTile[],
    tileParameterReferences: TileReferences,
): KeyCount => ({
    possible: tiles.filter(
        (tile) =>
            getControlKeysOnTile(control, tile, tileParameterReferences)
                .length > 0,
    ).length,
    applied: tiles.filter((tile) =>
        isControlSetOnTile(control, tile, tileParameterReferences),
    ).length,
});

// The total is every tile on the tab, whether or not it references a parameter
const countTabs = (
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    isApplied: (tile: DashboardTile) => boolean,
): Record<string, ControlTabCount> =>
    Object.fromEntries(
        tabs.map((tab) => {
            const tabTiles = tiles.filter((tile) => tile.tabUuid === tab.uuid);
            return [
                tab.uuid,
                {
                    total: tabTiles.length,
                    applied: tabTiles.filter(isApplied).length,
                },
            ];
        }),
    );

export const getControlTabCounts = (
    control: DashboardParameterControl,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    tileParameterReferences: TileReferences,
): Record<string, ControlTabCount> =>
    countTabs(tiles, tabs, (tile) =>
        isControlSetOnTile(control, tile, tileParameterReferences),
    );

export const getControlTabCountsForKey = (
    control: DashboardParameterControl,
    key: string,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    tileParameterReferences: TileReferences,
): Record<string, ControlTabCount> =>
    countTabs(tiles, tabs, (tile) =>
        isKeySetOnTile(control, key, tile, tileParameterReferences),
    );

export const getControlledParameterKeys = (
    controls: DashboardParameterControl[],
): string[] => [
    ...new Set(controls.flatMap((control) => control.parameterKeys)),
];

// Parameters of the kind that a tile references and no control holds
export const getFreeParameterKeys = (
    kind: ParameterKind,
    controls: DashboardParameterControl[],
    definitions: ParameterDefinitions,
    tileParameterReferences: TileReferences,
): string[] => {
    const taken = new Set(getControlledParameterKeys(controls));
    const referenced = [
        ...new Set(Object.values(tileParameterReferences).flat()),
    ];
    return referenced.filter((key) => {
        const definition = definitions[key];
        return (
            definition !== undefined &&
            !taken.has(key) &&
            getParameterKind(definition) === kind
        );
    });
};

// The control shows the value of its first parameter
export const getControlValue = (
    control: DashboardParameterControl,
    parameterValues: ParametersValuesMap,
): ParameterValue | undefined => {
    const [first] = control.parameterKeys;
    return first === undefined ? undefined : parameterValues[first];
};
