import {
    getItemId,
    hashFieldReference,
    isField,
    type ItemsMap,
    type MergeFieldOrigins,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type UnderlyingDataConfig } from '../../../components/MetricQueryData/types';
import { useMergeSafe } from '../context/useMerge';
import {
    useMergeSourceCell,
    type ResolvedMergeSourceCell,
} from './useMergeSourceCell';

type MergedCell = {
    item: ItemsMap[string] | undefined;
    fieldValues: Record<string, ResultValue>;
    pivotReference?: PivotReference;
};

/** Re-keys a clicked merged cell to the source that owns its column; null when no source does. */
const getMergeSourceConfig = (
    cell: MergedCell,
    fieldOrigins: MergeFieldOrigins,
    resolve: ReturnType<typeof useMergeSourceCell>['resolve'],
): (ResolvedMergeSourceCell & { pivotReference?: PivotReference }) | null => {
    if (!cell.item || !isField(cell.item)) return null;
    const origin = fieldOrigins[getItemId(cell.item)];
    const sourceCell = resolve(cell.item, cell.fieldValues);
    if (!sourceCell || origin?.kind !== 'source') return null;
    if (!cell.pivotReference) return sourceCell;

    // Pivot values from another source don't constrain this source's rows
    const pivotReference: PivotReference = {
        field: getItemId(sourceCell.item),
        pivotValues: cell.pivotReference.pivotValues?.flatMap((pivotValue) => {
            const pivotOrigin = fieldOrigins[pivotValue.field];
            const field =
                pivotOrigin?.kind === 'joinKey'
                    ? pivotOrigin.fieldIdBySourceId[origin.sourceId]
                    : pivotOrigin?.kind === 'source' &&
                        pivotOrigin.sourceId === origin.sourceId
                      ? pivotOrigin.sourceFieldId
                      : undefined;
            return field ? [{ ...pivotValue, field }] : [];
        }),
    };
    const pivotedValue =
        cell.fieldValues[hashFieldReference(cell.pivotReference)];
    return {
        ...sourceCell,
        fieldValues: pivotedValue
            ? {
                  ...sourceCell.fieldValues,
                  [hashFieldReference(pivotReference)]: pivotedValue,
              }
            : sourceCell.fieldValues,
        pivotReference,
    };
};

/** Routes a merged-row underlying data request to the source that owns the clicked column. */
export const useMergeUnderlyingDataConfig = (
    config: UnderlyingDataConfig | undefined,
): { config: UnderlyingDataConfig | undefined; isError: boolean } => {
    const { prepareUnderlyingData, resolve } = useMergeSourceCell();
    const fieldOrigins = useMergeSafe()?.mergeResults?.fieldOrigins;
    const sourceCell = useMemo(
        () =>
            config && fieldOrigins
                ? getMergeSourceConfig(config, fieldOrigins, resolve)
                : null,
        [config, fieldOrigins, resolve],
    );
    const prepared = useQuery({
        queryKey: ['mergeUnderlyingDataSource', sourceCell],
        queryFn: () => {
            if (!sourceCell) throw new Error('Column has no source field');
            return prepareUnderlyingData(sourceCell);
        },
        enabled: sourceCell !== null,
        cacheTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
    });

    return {
        config:
            config && sourceCell && prepared.data
                ? {
                      ...config,
                      item: prepared.data.item,
                      fieldValues: prepared.data.fieldValues,
                      pivotReference: sourceCell.pivotReference,
                      source: prepared.data.source,
                  }
                : undefined,
        isError:
            (config !== undefined && sourceCell === null) || prepared.isError,
    };
};
