import {
    DashboardTileParameterSource,
    getDashboardTileParameterOverrides,
    getDashboardTileParameterSource,
    getDashboardValuesForTile,
    resolveParameterDefault,
    type DashboardParameterControl,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

// 'none' means no value resolves anywhere for the tile
type ParameterSource = 'dashboard' | 'chart' | 'default' | 'none';

export type TileParameterSource = {
    value: ParameterValue | null;
    source: ParameterSource;
};

type Args = {
    tileUuid: string;
    key: string;
    parameterValues: ParametersValuesMap;
    parameterControls: DashboardParameterControl[];
    tileChartSavedParameters: Record<string, ParametersValuesMap>;
    parameterDefinitions: ParameterDefinitions;
};

const toSource = (
    shipped: DashboardTileParameterSource,
): Exclude<ParameterSource, 'none'> => {
    switch (shipped) {
        case DashboardTileParameterSource.DASHBOARD:
            return 'dashboard';
        case DashboardTileParameterSource.CHART:
            return 'chart';
        case DashboardTileParameterSource.DEFAULT:
            return 'default';
    }
};

// The value a tile runs with for one parameter, after its parameter controls
export const getTileParameterSource = ({
    tileUuid,
    key,
    parameterValues,
    parameterControls,
    tileChartSavedParameters,
    parameterDefinitions,
}: Args): TileParameterSource => {
    const inputs = {
        definitions: parameterDefinitions,
        dashboardValues: getDashboardValuesForTile({
            dashboardValues: parameterValues,
            parameterControls,
            tileUuid,
        }),
        chartSavedValues: tileChartSavedParameters[tileUuid] ?? {},
        isTargeted: true,
    };
    const shipped = getDashboardTileParameterSource({ key, ...inputs });
    const definition = parameterDefinitions[key];
    const value =
        shipped === DashboardTileParameterSource.DEFAULT
            ? definition && resolveParameterDefault(definition)
            : getDashboardTileParameterOverrides(inputs)[key];
    return value === undefined
        ? { value: null, source: 'none' }
        : { value, source: toSource(shipped) };
};

export const formatParameterValue = (value: ParameterValue | null): string =>
    value === null ? '' : Array.isArray(value) ? value.join(', ') : `${value}`;
