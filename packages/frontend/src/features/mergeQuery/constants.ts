import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    MergeJoinType,
    PRIMARY_SOURCE_ID,
} from '@lightdash/common';
import { type MergeEditorSource, type MergeJoinPart } from './context/context';

// Canonical merge editor naming lives in common so the backend can mint
// merge links with the exact same conventions.
export {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    JOIN_KEY,
    MAX_MERGE_SOURCES,
    PRIMARY_SOURCE_ID,
} from '@lightdash/common';

export const emptyMergeSource = (id: string): MergeEditorSource => ({
    id,
    exploreName: null,
    dimensions: [],
    metrics: [],
    filters: {},
});

/** Stand-in when no provider is mounted; the setup panel renders nothing. */
export const EMPTY_MERGE = {
    isMerging: false,
    readOnly: false,
    wasRestored: false,
    focus: { kind: 'source' as const, sourceId: PRIMARY_SOURCE_ID },
    additionalSources: [] as MergeEditorSource[],
    joinParts: [
        {
            fieldIdBySourceId: {
                [PRIMARY_SOURCE_ID]: null,
                [DEFAULT_ADDITIONAL_SOURCE_ID]: null,
            },
        },
    ] as MergeJoinPart[],
    joinType: MergeJoinType.FULL,
    addSource: () => {},
    removeSource: () => {},
    setFocus: () => {},
    setSourceExplore: () => {},
    toggleSourceField: () => {},
    setJoinField: () => {},
    addJoinPart: () => {},
    removeJoinPart: () => {},
    setJoinType: () => {},
    setSourceFilters: () => {},
};
