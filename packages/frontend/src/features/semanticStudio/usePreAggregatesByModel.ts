import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import { useMemo } from 'react';
import useHealth from '../../hooks/health/useHealth';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import { PRE_AGGREGATES_PAGE_SIZE } from './preAggregateSummary';

const NONE = new Map<string, PreAggregateMaterializationSummary[]>();

/** The project's published pre-aggregates by the model they summarise; empty where the instance has none. */
export const usePreAggregatesByModel = (projectUuid: string) => {
    const isEnabled = useHealth().data?.preAggregates.enabled === true;
    const { data } = usePreAggregateMaterializations(
        isEnabled ? projectUuid : '',
        PRE_AGGREGATES_PAGE_SIZE,
    );
    return useMemo(() => {
        if (!data) return NONE;
        const byModel = new Map<string, PreAggregateMaterializationSummary[]>();
        data.pages
            .flatMap((page) => page.data.materializations)
            .forEach((summary) => {
                byModel.set(summary.sourceExploreName, [
                    ...(byModel.get(summary.sourceExploreName) ?? []),
                    summary,
                ]);
            });
        return byModel;
    }, [data]);
};
