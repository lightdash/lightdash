import { type Filters } from './filter';
import { MergeJoinType } from './mergeQuery';
import { type MetricQuery } from './metricQuery';

// The merge editor's canonical naming: sources take these fixed ids and join
// keys `join_key_<i>`, so a merge built anywhere reads identically downstream.
export const PRIMARY_SOURCE_ID = 'a';
export const DEFAULT_ADDITIONAL_SOURCE_ID = 'b';
export const MAX_MERGE_SOURCES = 2;
export const JOIN_KEY = 'join_key';

export type MergeEditorSource = {
    id: string;
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
    filters: Filters;
    /** Keep saved-query-only fields intact while the merge is edited. */
    additionalMetrics?: MetricQuery['additionalMetrics'];
    customDimensions?: MetricQuery['customDimensions'];
};

export type MergeFocus =
    | { kind: 'source'; sourceId: string }
    | { kind: 'join' };

/** One part of the join key: the field each source contributes. */
export type MergeJoinPart = {
    fieldIdBySourceId: Record<string, string | null>;
};

/** Search param the merge relationship is kept in. */
export const MERGE_URL_PARAM = 'merge';

export type MergeUrlState = {
    focus: MergeFocus;
    additionalSources: MergeEditorSource[];
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
};

type SerializedSource = {
    i: string;
    e: string | null;
    d: string[];
    m: string[];
    w: Filters;
    a?: MergeEditorSource['additionalMetrics'];
    c?: MergeEditorSource['customDimensions'];
};

/** Short keys because this rides beside the already-large chart URL state. */
type SerializedMerge = {
    s: SerializedSource[];
    k: Array<Record<string, string | null>>;
    j: MergeJoinType;
    f: string;
};

/** URL shape emitted before editor state became source-addressed. */
type LegacySerializedMerge = {
    e?: unknown;
    d?: unknown;
    m?: unknown;
    k?: unknown;
    j?: unknown;
    w?: unknown;
    a?: MergeEditorSource['additionalMetrics'];
    c?: MergeEditorSource['customDimensions'];
    f?: unknown;
};

const isJoinType = (value: unknown): value is MergeJoinType =>
    typeof value === 'string' &&
    (Object.values(MergeJoinType) as string[]).includes(value);

const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

const asFilters = (value: unknown): Filters =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Filters)
        : {};

const focusFor = (value: unknown): MergeFocus =>
    value === 'join'
        ? { kind: 'join' }
        : {
              kind: 'source',
              sourceId: typeof value === 'string' ? value : PRIMARY_SOURCE_ID,
          };

export const serializeMergeState = (state: MergeUrlState): string =>
    JSON.stringify({
        s: state.additionalSources.map((source) => ({
            i: source.id,
            e: source.exploreName,
            d: source.dimensions,
            m: source.metrics,
            w: source.filters,
            a: source.additionalMetrics,
            c: source.customDimensions,
        })),
        k: state.joinParts.map((part) => part.fieldIdBySourceId),
        j: state.joinType,
        f: state.focus.kind === 'join' ? 'join' : state.focus.sourceId,
    } satisfies SerializedMerge);

const parseSource = (value: unknown): MergeEditorSource | null => {
    if (value === null || typeof value !== 'object') return null;
    const source = value as Partial<SerializedSource>;
    if (typeof source.i !== 'string' || source.i.length === 0) return null;
    return {
        id: source.i,
        exploreName: typeof source.e === 'string' ? source.e : null,
        dimensions: asStringArray(source.d),
        metrics: asStringArray(source.m),
        filters: asFilters(source.w),
        additionalMetrics: source.a,
        customDimensions: source.c,
    };
};

const parseJoinParts = (
    value: unknown,
    sourceIds: string[],
): MergeJoinPart[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (entry === null || typeof entry !== 'object') return [];
        const fields = entry as Record<string, unknown>;
        return [
            {
                fieldIdBySourceId: Object.fromEntries(
                    sourceIds.map((sourceId) => [
                        sourceId,
                        typeof fields[sourceId] === 'string'
                            ? fields[sourceId]
                            : null,
                    ]),
                ),
            },
        ];
    });
};

const parseCurrent = (value: Record<string, unknown>): MergeUrlState | null => {
    if (!Array.isArray(value.s)) return null;
    const additionalSources = value.s.flatMap((entry) => {
        const source = parseSource(entry);
        return source ? [source] : [];
    });
    if (additionalSources.length !== value.s.length) return null;
    const additionalSourceIds = additionalSources.map((source) => source.id);
    if (
        additionalSources.length === 0 ||
        additionalSources.length + 1 > MAX_MERGE_SOURCES ||
        additionalSourceIds.includes(PRIMARY_SOURCE_ID) ||
        new Set(additionalSourceIds).size !== additionalSourceIds.length
    ) {
        return null;
    }
    const sourceIds = [PRIMARY_SOURCE_ID, ...additionalSourceIds];
    const joinParts = parseJoinParts(value.k, sourceIds);
    return {
        focus: focusFor(value.f),
        additionalSources,
        joinParts:
            joinParts.length > 0
                ? joinParts
                : [
                      {
                          fieldIdBySourceId: Object.fromEntries(
                              sourceIds.map((id) => [id, null]),
                          ),
                      },
                  ],
        joinType: isJoinType(value.j) ? value.j : MergeJoinType.FULL,
    };
};

const parseLegacy = (value: LegacySerializedMerge): MergeUrlState => {
    const source: MergeEditorSource = {
        id: DEFAULT_ADDITIONAL_SOURCE_ID,
        exploreName: typeof value.e === 'string' ? value.e : null,
        dimensions: asStringArray(value.d),
        metrics: asStringArray(value.m),
        filters: asFilters(value.w),
        additionalMetrics: value.a,
        customDimensions: value.c,
    };
    const legacyParts = Array.isArray(value.k) ? value.k : [];
    const joinParts = legacyParts.flatMap((entry) =>
        Array.isArray(entry)
            ? [
                  {
                      fieldIdBySourceId: {
                          [PRIMARY_SOURCE_ID]:
                              typeof entry[0] === 'string' ? entry[0] : null,
                          [source.id]:
                              typeof entry[1] === 'string' ? entry[1] : null,
                      },
                  },
              ]
            : [],
    );
    return {
        focus: focusFor(value.f),
        additionalSources: [source],
        joinParts:
            joinParts.length > 0
                ? joinParts
                : [
                      {
                          fieldIdBySourceId: {
                              [PRIMARY_SOURCE_ID]: null,
                              [source.id]: null,
                          },
                      },
                  ],
        joinType: isJoinType(value.j) ? value.j : MergeJoinType.FULL,
    };
};

/** Invalid links fail closed; legacy two-source links adapt at this seam. */
export const parseMergeState = (raw: string | null): MergeUrlState | null => {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        const value = parsed as Record<string, unknown>;
        return 's' in value
            ? parseCurrent(value)
            : parseLegacy(value as LegacySerializedMerge);
    } catch {
        return null;
    }
};
