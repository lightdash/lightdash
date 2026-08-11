import { MergeJoinType } from '@lightdash/common';

/** Values offered when spreading a dimension into columns. */
export const MAX_PIVOT_VALUES = 50;

export const SOURCE_A = 'a';
export const SOURCE_B = 'b';
export const JOIN_KEY = 'join_key';

/** Stand-in when no provider is mounted; the setup panel renders nothing. */
export const EMPTY_MERGE = {
    isMerging: false,
    wasRestored: false,
    focus: 'a' as const,
    queryB: {
        exploreName: null,
        dimensions: [] as string[],
        metrics: [] as string[],
    },
    joinParts: [{ fieldA: null, fieldB: null }],
    joinType: MergeJoinType.FULL,
    pivotValues: [] as string[],
    postPivotIndex: null,
    addQuery: () => {},
    removeQuery: () => {},
    setFocus: () => {},
    setExploreB: () => {},
    toggleFieldB: () => {},
    setJoinField: () => {},
    addJoinPart: () => {},
    removeJoinPart: () => {},
    setJoinType: () => {},
    setPivotValues: () => {},
    setPostPivotIndex: () => {},
};
