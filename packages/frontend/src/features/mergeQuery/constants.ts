import { MergeJoinType } from '@lightdash/common';
import { type MergeEditorSource, type MergeJoinPart } from './context/context';

export const PRIMARY_SOURCE_ID = 'a';
export const DEFAULT_ADDITIONAL_SOURCE_ID = 'b';
export const MAX_MERGE_SOURCES = 2;
export const JOIN_KEY = 'join_key';

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
