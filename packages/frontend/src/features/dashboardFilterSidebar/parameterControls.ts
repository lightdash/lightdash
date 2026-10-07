import {
    FilterType,
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
    // tileUuid -> false means the control does not apply to that chart
    tileTargets: Record<string, false>;
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

// Tiles that reference any parameter of the control
export const getControlTiles = (
    control: Pick<ParameterControl, 'parameterKeys'>,
    tiles: DashboardTile[],
    tileParameterReferences: Record<string, string[]>,
): DashboardTile[] =>
    tiles.filter((tile) =>
        (tileParameterReferences[tile.uuid] ?? []).some((key) =>
            control.parameterKeys.includes(key),
        ),
    );

export const doesControlApplyToTile = (
    control: ParameterControl,
    tile: DashboardTile,
    tileParameterReferences: Record<string, string[]>,
): boolean =>
    control.tileTargets[tile.uuid] !== false &&
    (tileParameterReferences[tile.uuid] ?? []).some((key) =>
        control.parameterKeys.includes(key),
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
