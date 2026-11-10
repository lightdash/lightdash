import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { useLiveSourceExplore } from '../../../../../../features/externalConnections/liveSources/apiSourceExplore';
import { LIVE_DATA_SOURCE_LABEL, nodeTypeLabelOf } from './groupPipeline';

/** The live data source a semantic node's explore reads, or null for any other node. */
export const useComposerNodeLiveSource = (query: SourceQuery) =>
    useLiveSourceExplore(
        query.sourceType === QuerySourceType.SEMANTIC_LAYER
            ? query.exploreName
            : null,
    );

/** A node's type label; a node on a live data source's explore reads as one. */
export const useComposerNodeTypeLabel = (query: SourceQuery): string =>
    useComposerNodeLiveSource(query)
        ? LIVE_DATA_SOURCE_LABEL
        : nodeTypeLabelOf(query);
