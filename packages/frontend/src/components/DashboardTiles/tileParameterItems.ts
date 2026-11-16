import {
    getDashboardTileParameterSource,
    type DashboardTileParameterInputs,
    type DashboardTileParameterSource,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

export type TileParameterItem = {
    key: string;
    label: string;
    value: ParameterValue;
    source: DashboardTileParameterSource;
    /** The query that ran this value, on a tile whose queries ran different values; null otherwise */
    sourceLabel: string | null;
};

/** Each value one query ran with, and where it came from. */
export const getTileParameterItems = ({
    usedParameterValues,
    definitions,
    inputs,
    sourceLabel,
}: {
    usedParameterValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
    inputs: DashboardTileParameterInputs;
    sourceLabel: string | null;
}): TileParameterItem[] =>
    Object.entries(usedParameterValues).map(([key, value]) => ({
        key,
        label: definitions[key]?.label || key,
        value,
        source: getDashboardTileParameterSource({
            key,
            definitions,
            ...inputs,
        }),
        sourceLabel,
    }));
