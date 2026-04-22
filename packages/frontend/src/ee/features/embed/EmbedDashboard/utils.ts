import {
    getItemId,
    matchFieldByTypeAndName,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterOperator,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { type SdkFilter } from './types';

/**
 * Whether SDK filter conversion should be deferred until the data needed to
 * build cross-explore tileTargets is available.
 *
 * The available-filters query is `enabled: savedChartUuidsAndTileUuids.length > 0`,
 * which means React Query reports `isInitialLoading: false` for the whole
 * window between provider mount and dashboard tile metadata arriving — even
 * though no fetch has happened yet. Gating SDK filter conversion on that
 * loading flag therefore lets the converter fire too early on a cold load,
 * with `filterableFieldsByTileUuid` undefined, producing `tileTargets: {}`
 * and silently dropping the filter from any tile on a different explore.
 */
export const shouldDeferSdkFilters = (
    savedChartUuidsAndTileUuids:
        | SavedChartsInfoForDashboardAvailableFilters
        | undefined,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[] | undefined>
        | undefined,
): boolean => {
    if (savedChartUuidsAndTileUuids === undefined) return true;
    if (savedChartUuidsAndTileUuids.length === 0) return false;
    return filterableFieldsByTileUuid === undefined;
};

/**
 * Build tileTargets for an SDK filter by matching fields across all tiles.
 *
 * First finds the "source" field (exact table+name match) to learn its type,
 * then maps across all tiles by type+name — so tiles using a different explore
 * that has the same field name on a different table will still get the filter.
 */
const buildSdkFilterTileTargets = (
    filter: SdkFilter,
    filterableFieldsByTileUuid: Record<
        string,
        DashboardFilterableField[] | undefined
    >,
): Record<string, DashboardFieldTarget> => {
    const sourceField = Object.values(filterableFieldsByTileUuid)
        .flat()
        .find(
            (f) =>
                f !== undefined &&
                f.table === filter.model &&
                f.name === filter.field,
        );

    if (!sourceField) return {};

    const matchesByTypeAndName = matchFieldByTypeAndName(sourceField);

    return Object.entries(filterableFieldsByTileUuid).reduce<
        Record<string, DashboardFieldTarget>
    >((acc, [tileUuid, availableFilters]) => {
        if (!availableFilters) return acc;

        const matchingField = availableFilters.find(matchesByTypeAndName);
        if (!matchingField) return acc;

        acc[tileUuid] = {
            fieldId: getItemId(matchingField),
            tableName: matchingField.table,
        };
        return acc;
    }, {});
};

export const convertSdkFilterToDashboardFilter = (
    filter: SdkFilter,
    filterableFieldsByTileUuid?: Record<
        string,
        DashboardFilterableField[] | undefined
    >,
): DashboardFilterRule => {
    const fieldId = getItemId({
        table: filter.model,
        name: filter.field,
    });

    const tileTargets = filterableFieldsByTileUuid
        ? buildSdkFilterTileTargets(filter, filterableFieldsByTileUuid)
        : {};

    return {
        id: uuidv4(),
        label: filter.field,
        target: {
            fieldId,
            tableName: filter.model,
        },
        operator: filter.operator as FilterOperator,
        values: Array.isArray(filter.value) ? filter.value : [filter.value],
        tileTargets,
    };
};
