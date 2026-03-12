import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type FilterableDimension,
    type FilterOperator,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { type SdkFilter } from './types';

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
        FilterableDimension[] | undefined
    >,
): Record<string, DashboardFieldTarget> => {
    // Find the source field to learn its type
    const sourceField = Object.values(filterableFieldsByTileUuid)
        .flat()
        .find(
            (f) =>
                f !== undefined &&
                f.table === filter.model &&
                f.name === filter.field,
        );

    if (!sourceField) return {};

    return Object.entries(filterableFieldsByTileUuid).reduce<
        Record<string, DashboardFieldTarget>
    >((acc, [tileUuid, availableFilters]) => {
        if (!availableFilters) return acc;

        const matchingField = availableFilters.find(
            (f) => f.type === sourceField.type && f.name === sourceField.name,
        );
        if (!matchingField) return acc;

        return {
            ...acc,
            [tileUuid]: {
                fieldId: getItemId(matchingField),
                tableName: matchingField.table,
            },
        };
    }, {});
};

export const convertSdkFilterToDashboardFilter = (
    filter: SdkFilter,
    filterableFieldsByTileUuid?: Record<
        string,
        FilterableDimension[] | undefined
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
