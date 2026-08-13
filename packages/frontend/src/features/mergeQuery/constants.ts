import { MergeJoinType } from '@lightdash/common';

export const SOURCE_A = 'a';
export const SOURCE_B = 'b';
export const JOIN_KEY = 'join_key';

/** Stand-in when no provider is mounted; the setup panel renders nothing. */
export const EMPTY_MERGE = {
    isMerging: false,
    readOnly: false,
    wasRestored: false,
    focus: 'a' as const,
    queryB: {
        exploreName: null,
        dimensions: [] as string[],
        metrics: [] as string[],
        additionalMetrics: undefined,
        customDimensions: undefined,
    },
    joinParts: [{ fieldA: null, fieldB: null }],
    joinType: MergeJoinType.FULL,
    filtersB: {},
    addQuery: () => {},
    removeQuery: () => {},
    setFocus: () => {},
    setExploreB: () => {},
    toggleFieldB: () => {},
    setJoinField: () => {},
    addJoinPart: () => {},
    removeJoinPart: () => {},
    setJoinType: () => {},
    setFiltersB: () => {},
};
