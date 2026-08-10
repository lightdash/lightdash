import { MergeJoinType } from '@lightdash/common';
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
    pivotValues: string[];
    postPivotIndex: number | null;
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
    p: string[];
    f: MergeFocus;
    /** Index of the post-pivoted key part. */
    x: number | null;
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
        p: state.pivotValues,
        f: state.focus,
        x: state.postPivotIndex,
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
        },
        joinParts: asJoinParts(value.k),
        joinType: isJoinType(value.j) ? value.j : MergeJoinType.FULL,
        pivotValues: asStringArray(value.p),
        postPivotIndex:
            typeof value.x === 'number' && Number.isInteger(value.x)
                ? value.x
                : null,
    };
};
