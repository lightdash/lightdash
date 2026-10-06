import {
    DashboardTileParameterSource,
    getDashboardTileParameterSource,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

// 'chart' here means "not from the dashboard and no default": the chart's
// saved value is not exposed by the dashboard context, so value stays null.
export type ParameterSource = 'dashboard' | 'chart' | 'default';

export type TileParameterSource = {
    tileUuid: string;
    value: ParameterValue | null;
    source: ParameterSource;
};

type Args = {
    parameterValues: ParametersValuesMap;
    tileParameterReferences: Record<string, string[]>;
    parameterDefinitions: ParameterDefinitions;
};

export const getParameterSources = ({
    parameterValues,
    tileParameterReferences,
    parameterDefinitions,
}: Args): Record<string, TileParameterSource[]> =>
    Object.entries(tileParameterReferences).reduce<
        Record<string, TileParameterSource[]>
    >(
        (acc, [tileUuid, keys]) =>
            keys.reduce((byKey, key) => {
                const shipped = getDashboardTileParameterSource({
                    key,
                    dashboardValues: parameterValues,
                    chartSavedValues: {},
                    isTargeted: true,
                    definitions: parameterDefinitions,
                });
                const defaultValue = parameterDefinitions[key]?.default;
                const entry: TileParameterSource =
                    shipped === DashboardTileParameterSource.DASHBOARD
                        ? {
                              tileUuid,
                              value: parameterValues[key] ?? null,
                              source: 'dashboard',
                          }
                        : defaultValue !== undefined
                          ? { tileUuid, value: defaultValue, source: 'default' }
                          : { tileUuid, value: null, source: 'chart' };
                return { ...byKey, [key]: [...(byKey[key] ?? []), entry] };
            }, acc),
        {},
    );

export const formatParameterValue = (value: ParameterValue | null): string =>
    value === null ? '' : Array.isArray(value) ? value.join(', ') : `${value}`;

export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;
