import {
    DashboardTileParameterSource,
    getDashboardTileParameterOverrides,
    getDashboardTileParameterSource,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

// 'none' means the tile references the key but no value resolves anywhere.
export type ParameterSource = 'dashboard' | 'chart' | 'default' | 'none';

export type TileParameterSource = {
    tileUuid: string;
    value: ParameterValue | null;
    source: ParameterSource;
};

type Args = {
    parameterValues: ParametersValuesMap;
    tileParameterReferences: Record<string, string[]>;
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

export const getParameterSources = ({
    parameterValues,
    tileParameterReferences,
    tileChartSavedParameters,
    parameterDefinitions,
}: Args): Record<string, TileParameterSource[]> =>
    Object.entries(tileParameterReferences).reduce<
        Record<string, TileParameterSource[]>
    >((acc, [tileUuid, keys]) => {
        const inputs = {
            definitions: parameterDefinitions,
            dashboardValues: parameterValues,
            chartSavedValues: tileChartSavedParameters[tileUuid] ?? {},
            isTargeted: true,
        };
        const overrides = getDashboardTileParameterOverrides(inputs);
        return keys.reduce((byKey, key) => {
            const shipped = getDashboardTileParameterSource({ key, ...inputs });
            const value =
                shipped === DashboardTileParameterSource.DEFAULT
                    ? parameterDefinitions[key]?.default
                    : overrides[key];
            const entry: TileParameterSource =
                value === undefined
                    ? { tileUuid, value: null, source: 'none' }
                    : { tileUuid, value, source: toSource(shipped) };
            return { ...byKey, [key]: [...(byKey[key] ?? []), entry] };
        }, acc);
    }, {});

export const formatParameterValue = (value: ParameterValue | null): string =>
    value === null ? '' : Array.isArray(value) ? value.join(', ') : `${value}`;

export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;

// Keys referenced by at least one tile on the tab; null tab means any tile.
