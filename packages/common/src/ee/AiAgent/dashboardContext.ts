import { isEqual } from 'es-toolkit/compat';
import { type DateZoomConfig } from '../../types/dashboard';
import { type DashboardFilterRule } from '../../types/filter';
import { type ParametersValuesMap } from '../../types/parameters';
import { type DateGranularity } from '../../types/timeFrames';
import { getControlActiveGranularity } from '../../utils/dateZoom';
import {
    type AiDashboardDateZoomControl,
    type AiDashboardFilterRule,
    type AiDashboardFilters,
    type AiDashboardTileParameters,
    type AiDashboardTileRef,
} from './requestTypes';

type AiDashboardFilterRuleInput = AiDashboardFilterRule &
    Partial<
        Pick<
            DashboardFilterRule,
            | 'id'
            | 'tileTargets'
            | 'lockedTabUuids'
            | 'requiredGroupId'
            | 'sectionId'
        >
    >;

type AiDashboardFiltersInput = {
    dimensions: AiDashboardFilterRuleInput[];
    metrics: AiDashboardFilterRuleInput[];
    tableCalculations: AiDashboardFilterRuleInput[];
};

const serializeDashboardFilterRuleForAiContext = ({
    id: _id,
    tileTargets: _tileTargets,
    lockedTabUuids: _lockedTabUuids,
    requiredGroupId: _requiredGroupId,
    sectionId: _sectionId,
    ...filter
}: AiDashboardFilterRuleInput): AiDashboardFilterRule => filter;

export const serializeDashboardFiltersForAiContext = (
    filters: AiDashboardFiltersInput,
): AiDashboardFilters => ({
    dimensions: filters.dimensions.map(
        serializeDashboardFilterRuleForAiContext,
    ),
    metrics: filters.metrics.map(serializeDashboardFilterRuleForAiContext),
    tableCalculations: filters.tableCalculations.map(
        serializeDashboardFilterRuleForAiContext,
    ),
});

/** Undefined for a dashboard with no named date zoom */
export const getAiDashboardDateZoomControls = ({
    config,
    runtimeGranularities,
    tiles,
}: {
    config: DateZoomConfig;
    runtimeGranularities: Record<string, DateGranularity | string>;
    tiles: AiDashboardTileRef[];
}): AiDashboardDateZoomControl[] | undefined =>
    config.controls.length === 0
        ? undefined
        : config.controls.map((control) => ({
              uuid: control.uuid,
              name: control.name,
              granularity: getControlActiveGranularity(
                  control,
                  runtimeGranularities,
              ),
              isViewerPick: Object.hasOwn(runtimeGranularities, control.uuid),
              tiles: tiles.filter(
                  (tile) =>
                      config.tileTargets[tile.uuid]?.controlUuid ===
                      control.uuid,
              ),
          }));

/** Undefined without parameter controls, and while every tile runs with the values the controls hold without picks */
export const getAiDashboardTileParameters = ({
    tiles,
    parametersByTileUuid,
    unpickedParametersByTileUuid,
}: {
    tiles: AiDashboardTileRef[];
    parametersByTileUuid: Record<string, ParametersValuesMap> | undefined;
    unpickedParametersByTileUuid:
        | Record<string, ParametersValuesMap>
        | undefined;
}): AiDashboardTileParameters[] | undefined => {
    if (
        parametersByTileUuid === undefined ||
        unpickedParametersByTileUuid === undefined
    )
        return undefined;
    const entries = tiles.map((tile) => ({
        tile,
        parameters: parametersByTileUuid[tile.uuid] ?? {},
    }));
    return entries.every(({ tile, parameters }) =>
        isEqual(parameters, unpickedParametersByTileUuid[tile.uuid] ?? {}),
    )
        ? undefined
        : entries.filter(
              ({ parameters }) => Object.keys(parameters).length > 0,
          );
};

export const serializeDashboardDateZoomControlsForAiContext = (
    controls: AiDashboardDateZoomControl[],
) =>
    controls.map(({ name, granularity, isViewerPick, tiles }) => ({
        name,
        granularity,
        // Rows stored before the flag existed count as saved
        source: isViewerPick === true ? 'viewer pick' : 'saved',
        tiles: tiles.map((tile) => tile.name),
    }));

/** Tiles running with the same values share one entry */
export const serializeDashboardTileParametersForAiContext = (
    tileParameters: AiDashboardTileParameters[],
) =>
    tileParameters.reduce<
        { tiles: string[]; parameters: ParametersValuesMap }[]
    >((groups, { tile, parameters }) => {
        const group = groups.find((candidate) =>
            isEqual(candidate.parameters, parameters),
        );
        if (group) group.tiles.push(tile.name);
        else groups.push({ tiles: [tile.name], parameters });
        return groups;
    }, []);
