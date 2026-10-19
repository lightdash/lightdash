import { isField } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type UnderlyingDataConfig } from '../../../components/MetricQueryData/types';
import { useMergeSourceCell } from './useMergeSourceCell';

/** Routes a merged-row underlying data request to the source that owns the clicked column. */
export const useMergeUnderlyingDataConfig = (
    config: UnderlyingDataConfig | undefined,
): { config: UnderlyingDataConfig | undefined; isError: boolean } => {
    const { prepareUnderlyingData, resolve } = useMergeSourceCell();
    const sourceCell = useMemo(
        () =>
            config?.item && isField(config.item)
                ? resolve(config.item, config.fieldValues)
                : null,
        [config, resolve],
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
            config && prepared.data
                ? {
                      item: prepared.data.item,
                      value: config.value,
                      fieldValues: prepared.data.fieldValues,
                      source: prepared.data.source,
                  }
                : undefined,
        isError:
            (config !== undefined && sourceCell === null) || prepared.isError,
    };
};
