import { useMemo } from 'react';
import { selectTableName, useExplorerSelector } from '../../explorer/store';
import { useMergeSafe } from '../context/useMerge';
import {
    getMergeSourceNames,
    type MergeSourceNames,
} from '../utils/getMergeSourceNames';

/** The names the current merge's sources run under, by editor handle. */
export const useMergeSourceNames = (): MergeSourceNames => {
    const tableName = useExplorerSelector(selectTableName);
    const merge = useMergeSafe();
    const primarySourceName = merge?.primarySourceName ?? null;
    const additionalSources = merge?.additionalSources;
    return useMemo(
        () =>
            getMergeSourceNames({
                tableName,
                primarySourceName,
                additionalSources: additionalSources ?? [],
            }),
        [tableName, primarySourceName, additionalSources],
    );
};
