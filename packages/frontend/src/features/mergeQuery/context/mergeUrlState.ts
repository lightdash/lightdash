import {
    MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
    MergeJoinType,
    type Filters,
    type MergeTableCalculation,
} from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    MAX_MERGE_SOURCES,
    PRIMARY_SOURCE_ID,
} from '../constants';
import {
    type MergeEditorSource,
    type MergeFocus,
    type MergeJoinPart,
} from './context';

/** Search param the merge relationship is kept in. */
export const MERGE_URL_PARAM = 'merge';

export type MergeUrlState = {
    focus: MergeFocus;
    /** The chart query's saved name, when a chart fixed it. */
    primarySourceName: string | null;
    additionalSources: MergeEditorSource[];
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
    repeatValuesSourceIds: string[];
    tableCalculations: MergeTableCalculation[];
};

type SerializedSource = {
    i: string;
    /** Saved name, when fixed. */
    n?: string;
    e: string | null;
    d: string[];
    m: string[];
    w: Filters;
    a?: MergeEditorSource['additionalMetrics'];
    c?: MergeEditorSource['customDimensions'];
    tc?: MergeEditorSource['tableCalculations'];
    mo?: MergeEditorSource['metricOverrides'];
    do?: MergeEditorSource['dimensionOverrides'];
    tz?: MergeEditorSource['timezone'];
};

/** Short keys because this rides beside the already-large chart URL state. */
type SerializedMerge = {
    /** The chart query's saved name, when fixed. */
    p?: string;
    s: SerializedSource[];
    k: Array<Record<string, string | null>>;
    /** Saved key column names by part index; null where not fixed. */
    kn?: Array<string | null>;
    j: MergeJoinType;
    f: string;
    /** Sources repeating their values; omitted when none do. */
    r?: string[];
    /** Merge-level table calculations; omitted when none exist. */
    t?: MergeTableCalculation[];
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
        ...(state.primarySourceName ? { p: state.primarySourceName } : {}),
        s: state.additionalSources.map((source) => ({
            i: source.id,
            ...(source.name ? { n: source.name } : {}),
            e: source.exploreName,
            d: source.dimensions,
            m: source.metrics,
            w: source.filters,
            a: source.additionalMetrics,
            c: source.customDimensions,
            tc: source.tableCalculations,
            mo: source.metricOverrides,
            do: source.dimensionOverrides,
            tz: source.timezone,
        })),
        k: state.joinParts.map((part) => part.fieldIdBySourceId),
        ...(state.joinParts.some((part) => part.name)
            ? { kn: state.joinParts.map((part) => part.name ?? null) }
            : {}),
        j: state.joinType,
        f: state.focus.kind === 'join' ? 'join' : state.focus.sourceId,
        ...(state.repeatValuesSourceIds.length > 0
            ? { r: state.repeatValuesSourceIds }
            : {}),
        ...(state.tableCalculations.length > 0
            ? { t: state.tableCalculations }
            : {}),
    } satisfies SerializedMerge);

const parseSource = (value: unknown): MergeEditorSource | null => {
    if (value === null || typeof value !== 'object') return null;
    const source = value as Partial<SerializedSource>;
    if (typeof source.i !== 'string' || source.i.length === 0) return null;
    return {
        id: source.i,
        ...(typeof source.n === 'string' && source.n.length > 0
            ? { name: source.n }
            : {}),
        exploreName: typeof source.e === 'string' ? source.e : null,
        dimensions: asStringArray(source.d),
        metrics: asStringArray(source.m),
        filters: asFilters(source.w),
        additionalMetrics: source.a,
        customDimensions: source.c,
        ...(source.tc ? { tableCalculations: source.tc } : {}),
        ...(source.mo ? { metricOverrides: source.mo } : {}),
        ...(source.do ? { dimensionOverrides: source.do } : {}),
        ...(source.tz ? { timezone: source.tz } : {}),
    };
};

const parseJoinParts = (
    value: unknown,
    sourceIds: string[],
    names: unknown,
): MergeJoinPart[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry, index) => {
        if (entry === null || typeof entry !== 'object') return [];
        const fields = entry as Record<string, unknown>;
        const name = Array.isArray(names) ? names[index] : null;
        return [
            {
                ...(typeof name === 'string' && name.length > 0
                    ? { name }
                    : {}),
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

const parseTableCalculations = (
    value: unknown,
): MergeTableCalculation[] | null => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;

    const calculations = value.flatMap((entry) => {
        if (entry === null || typeof entry !== 'object') return [];
        const calculation = entry as Record<string, unknown>;
        if (
            typeof calculation.name !== 'string' ||
            calculation.name.length === 0 ||
            typeof calculation.displayName !== 'string' ||
            calculation.displayName.length === 0 ||
            typeof calculation.sql !== 'string' ||
            (calculation.formula !== undefined &&
                (typeof calculation.formula !== 'string' ||
                    calculation.formula.length >
                        MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH))
        ) {
            return [];
        }

        return [
            {
                name: calculation.name,
                displayName: calculation.displayName,
                sql: calculation.sql,
                ...(typeof calculation.formula === 'string'
                    ? { formula: calculation.formula }
                    : {}),
            },
        ];
    });

    return calculations.length === value.length ? calculations : null;
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
    const joinParts = parseJoinParts(value.k, sourceIds, value.kn);
    const tableCalculations = parseTableCalculations(value.t);
    if (tableCalculations === null) return null;
    return {
        focus: focusFor(value.f),
        primarySourceName:
            typeof value.p === 'string' && value.p.length > 0 ? value.p : null,
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
        repeatValuesSourceIds: asStringArray(value.r).filter((id) =>
            sourceIds.includes(id),
        ),
        tableCalculations,
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
        primarySourceName: null,
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
        repeatValuesSourceIds: [],
        tableCalculations: [],
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
