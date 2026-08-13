import { MergeJoinType, type Filters } from '@lightdash/common';
import {
    type MergeFocus,
    type MergeJoinPart,
    type MergeQueryBState,
} from './context';

/** Search param the merge relationship is kept in. */
export const MERGE_URL_PARAM = 'merge';

export type MergeUrlState = {
    focus: MergeFocus;
    queryB: MergeQueryBState;
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
    /** Query B's own filters. */
    filtersB: Filters;
};

/**
 * Short keys because this rides in the URL alongside the chart state, which is
 * already long enough to strain what a browser and a Slack unfurl will carry.
 */
type SerializedMerge = {
    e: string | null;
    d: string[];
    m: string[];
    /** Join key parts as [queryA field, queryB field] pairs. */
    k: Array<[string | null, string | null]>;
    j: MergeJoinType;
    /** Query B's filters ("where"). */
    w: Filters;
    a?: MergeQueryBState['additionalMetrics'];
    c?: MergeQueryBState['customDimensions'];
    f: MergeFocus;
};

const isJoinType = (value: unknown): value is MergeJoinType =>
    typeof value === 'string' &&
    (Object.values(MergeJoinType) as string[]).includes(value);

const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

export const serializeMergeState = (state: MergeUrlState): string =>
    JSON.stringify({
        e: state.queryB.exploreName,
        d: state.queryB.dimensions,
        m: state.queryB.metrics,
        k: state.joinParts.map((part) => [part.fieldA, part.fieldB]),
        j: state.joinType,
        w: state.filtersB,
        a: state.queryB.additionalMetrics,
        c: state.queryB.customDimensions,
        f: state.focus,
    } satisfies SerializedMerge);

const asJoinParts = (value: unknown): MergeJoinPart[] => {
    if (!Array.isArray(value)) return [{ fieldA: null, fieldB: null }];
    const parts = value.flatMap((entry) =>
        Array.isArray(entry)
            ? [
                  {
                      fieldA: typeof entry[0] === 'string' ? entry[0] : null,
                      fieldB: typeof entry[1] === 'string' ? entry[1] : null,
                  },
              ]
            : [],
    );
    // A merge always has at least one key part, even an unfilled one.
    return parts.length > 0 ? parts : [{ fieldA: null, fieldB: null }];
};

/**
 * Returns null for anything that does not parse. A merge shared with a stale or
 * hand-edited link should drop back to the ordinary explorer rather than throw
 * the page away.
 */
export const parseMergeState = (raw: string | null): MergeUrlState | null => {
    if (!raw) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;

    const value = parsed as Partial<SerializedMerge>;
    return {
        focus: value.f === 'b' ? 'b' : 'a',
        queryB: {
            exploreName: typeof value.e === 'string' ? value.e : null,
            dimensions: asStringArray(value.d),
            metrics: asStringArray(value.m),
            additionalMetrics: value.a,
            customDimensions: value.c,
        },
        joinParts: asJoinParts(value.k),
        joinType: isJoinType(value.j) ? value.j : MergeJoinType.FULL,
        filtersB:
            typeof value.w === 'object' &&
            value.w !== null &&
            !Array.isArray(value.w)
                ? value.w
                : {},
    };
};
