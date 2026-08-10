import { MergeJoinType } from '@lightdash/common';
import { type MergeFocus, type MergeQueryBState } from './context';

/** Search param the merge relationship is kept in. */
export const MERGE_URL_PARAM = 'merge';

export type MergeUrlState = {
    focus: MergeFocus;
    queryB: MergeQueryBState;
    joinFieldA: string | null;
    joinFieldB: string | null;
    joinType: MergeJoinType;
    pivotValues: string[];
};

/**
 * Short keys because this rides in the URL alongside the chart state, which is
 * already long enough to strain what a browser and a Slack unfurl will carry.
 */
type SerializedMerge = {
    e: string | null;
    d: string[];
    m: string[];
    a: string | null;
    b: string | null;
    j: MergeJoinType;
    p: string[];
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
        a: state.joinFieldA,
        b: state.joinFieldB,
        j: state.joinType,
        p: state.pivotValues,
        f: state.focus,
    } satisfies SerializedMerge);

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
        joinFieldA: typeof value.a === 'string' ? value.a : null,
        joinFieldB: typeof value.b === 'string' ? value.b : null,
        joinType: isJoinType(value.j) ? value.j : MergeJoinType.FULL,
        pivotValues: asStringArray(value.p),
    };
};
