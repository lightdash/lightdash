import { type MergeFocus, type MergeQueryBState } from '../context/context';

type SelectedFields = {
    dimensions: string[];
    metrics: string[];
};

export const isMergeSourceReady = (query: SelectedFields): boolean =>
    query.dimensions.length > 0 && query.metrics.length > 0;

export const isMergeSourceBReady = (
    query: MergeQueryBState,
    isChoosingExplore = false,
): boolean =>
    !isChoosingExplore && !!query.exploreName && isMergeSourceReady(query);

export const getEffectiveMergeFocus = ({
    requested,
    queryAReady,
    queryBReady,
}: {
    requested: MergeFocus;
    queryAReady: boolean;
    queryBReady: boolean;
}): MergeFocus => {
    if (!queryAReady) return 'a';
    if (requested === 'join' && !queryBReady) return 'b';
    return requested;
};
