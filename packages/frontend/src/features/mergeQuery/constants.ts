import {
    MergeJoinType,
    MERGE_PRIMARY_SOURCE_ID as PRIMARY_SOURCE_ID,
    MERGE_ADDITIONAL_SOURCE_ID as DEFAULT_ADDITIONAL_SOURCE_ID,
} from '@lightdash/common';
export {
    MERGE_PRIMARY_SOURCE_ID as PRIMARY_SOURCE_ID,
    MERGE_ADDITIONAL_SOURCE_ID as DEFAULT_ADDITIONAL_SOURCE_ID,
    MERGE_JOIN_KEY as JOIN_KEY,
} from '@lightdash/common';
import { type MergeEditorSource, type MergeJoinPart } from './context/context';

export const MAX_MERGE_SOURCES = 2;

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
    replacesQuery: false,
    focus: { kind: 'source' as const, sourceId: PRIMARY_SOURCE_ID },
    additionalSources: [] as MergeEditorSource[],
    primarySourceName: null,
    joinParts: [
        {
            fieldIdBySourceId: {
                [PRIMARY_SOURCE_ID]: null,
                [DEFAULT_ADDITIONAL_SOURCE_ID]: null,
            },
        },
    ] as MergeJoinPart[],
    joinType: MergeJoinType.FULL,
    repeatValuesSourceIds: [] as string[],
    addSource: () => {},
    removeSource: () => {},
    setFocus: () => {},
    setSourceExplore: () => {},
    toggleSourceField: () => {},
    setJoinField: () => {},
    addJoinPart: () => {},
    removeJoinPart: () => {},
    setJoinType: () => {},
    setRepeatValues: () => {},
    setSourceFilters: () => {},
};
