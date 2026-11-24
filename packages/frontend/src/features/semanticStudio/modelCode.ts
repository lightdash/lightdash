import {
    assertUnreachable,
    diffModelDocuments,
    isWholeModelPath,
    MODEL_FRAGMENT_REFUSAL_TEXT,
    parseModelPartPath,
    type ModelFragmentChange,
    type ModelFragmentRefusal,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
    type SemanticLayerModelChange,
} from '@lightdash/common';
import { parseDiffFromFile } from '@pierre/diffs';
import { load } from 'js-yaml';

export const VIEW_PARAM = 'view';
/** What the workbench shows, beside the model's own tabs that share the param. */
const STUDIO_VIEWS = [
    'models',
    'code',
    'sources',
    'changes',
    'workspaces',
] as const;
export type StudioView = (typeof STUDIO_VIEWS)[number];
export const MODEL_TABS = [
    'fields',
    'lineage',
    'pre-aggregates',
    'history',
    'settings',
] as const;
export type ModelTab = (typeof MODEL_TABS)[number];

const isStudioView = (value: string | null): value is StudioView =>
    STUDIO_VIEWS.some((view) => view === value);

export const readStudioView = (
    searchParams: URLSearchParams,
): StudioView | null => {
    const value = searchParams.get(VIEW_PARAM);
    return isStudioView(value) ? value : null;
};

/** Search params that name a workbench view, plus any others. */
export type StudioParams = { [VIEW_PARAM]?: StudioView } & Record<
    string,
    string
>;
export const FIELD_PARAM = 'field';
export const DRAFT_PARAM = 'draft';
export const DRAFT_REVIEW = 'review';

/** The query string that opens a model's YAML at one of its fields. */
export const getModelCodeSearch = (fieldName: string): string =>
    new URLSearchParams({
        [VIEW_PARAM]: 'code',
        [FIELD_PARAM]: fieldName,
    }).toString();

/** The 1-based line that defines a field in model YAML, or null when none does. */
export const findFieldLine = (
    content: string,
    fieldName: string,
): number | null => {
    const definitions = new Set(
        [fieldName, `"${fieldName}"`, `'${fieldName}'`].flatMap((name) => [
            `- name: ${name}`,
            `name: ${name}`,
            `${name}:`,
        ]),
    );
    // The model's own name sits at the top level; fields are always indented.
    const index = content
        .split('\n')
        .findIndex(
            (line) => line !== line.trimStart() && definitions.has(line.trim()),
        );
    return index === -1 ? null : index + 1;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The 1-based lines of a field's whole definition in model YAML: its line and all nested under it. */
export const findFieldBlock = (
    content: string,
    fieldName: string,
): { start: number; end: number } | null => {
    const start = findFieldLine(content, fieldName);
    if (start === null) return null;
    const lines = content.split('\n');
    const indent = indentOf(lines[start - 1]);
    const next = lines.findIndex(
        (line, index) =>
            index >= start && line.trim() !== '' && indentOf(line) <= indent,
    );
    const body = lines.slice(start, next === -1 ? lines.length : next);
    return {
        start,
        end: start + body.findLastIndex((line) => line.trim() !== '') + 1,
    };
};

/** A changed part in plain words: the key and what it is on, or the name of a whole field or join. */
const describePart = (path: string): string => {
    const part = parseModelPartPath(path);
    if (part === null) return path;
    if (part.part === 'model') return 'the whole model';
    if (part.part === 'key') return part.key;
    return part.key === null ? part.name : `${part.key} of ${part.name}`;
};

/** What a published change did, for one with no question to name it. */
const describePublished = (
    before: string | null,
    after: string | null,
): string => {
    if (before === null) return 'Published a new model';
    if (after === null) return 'Removed the model';
    const parts = diffModelDocuments(before, after).map(({ path }) =>
        describePart(path),
    );
    if (parts.length === 0) return 'Published with no change to this model';
    return `Changed ${parts.slice(0, 2).join(' and ')}${
        parts.length > 2 ? ` and ${parts.length - 2} more` : ''
    }`;
};

export const changeTitle = ({
    source,
    question,
    contentBefore,
    contentAfter,
}: Pick<
    SemanticLayerModelChange,
    'source' | 'question' | 'contentBefore' | 'contentAfter'
>): string => {
    switch (source) {
        case 'draft':
            return question ?? describePublished(contentBefore, contentAfter);
        case 'undo':
            return 'Undid an earlier change';
        default:
            return assertUnreachable(source, 'Unknown change source');
    }
};

type ContentChange = Pick<
    SemanticLayerModelChange,
    'contentBefore' | 'contentAfter'
>;

export type ChangeKind = 'new' | 'changed' | 'removed';

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
    new: 'New',
    changed: 'Changed',
    removed: 'Removed',
};

export const CHANGE_GLYPHS: Record<ChangeKind, string> = {
    new: '+',
    changed: '~',
    removed: '−',
};

/** How a field change is marked wherever it is listed. */
export const CHANGE_KIND_STYLE: Record<
    ChangeKind,
    { label: string; glyph: string; color: string }
> = {
    new: {
        label: CHANGE_KIND_LABELS.new,
        glyph: CHANGE_GLYPHS.new,
        color: 'green',
    },
    changed: {
        label: CHANGE_KIND_LABELS.changed,
        glyph: CHANGE_GLYPHS.changed,
        color: 'yellow',
    },
    removed: {
        label: CHANGE_KIND_LABELS.removed,
        glyph: CHANGE_GLYPHS.removed,
        color: 'red',
    },
};

/** What an applied change did to a model, as its history reads it. */
export const CHANGE_KIND_VERBS: Record<ChangeKind, string> = {
    new: 'Created',
    changed: 'Changed',
    removed: 'Removed',
};

export const getChangeKind = ({
    contentBefore,
    contentAfter,
}: ContentChange): ChangeKind => {
    if (contentBefore === null) return 'new';
    return contentAfter === null ? 'removed' : 'changed';
};

export const refusalText = (
    model: string,
    { path, reason }: ModelFragmentRefusal,
): string =>
    `Left out ${model}.${path} because it ${MODEL_FRAGMENT_REFUSAL_TEXT[reason]}.`;

/** The field or join a change path names, and the key changed on it; a null key means the whole thing. */
const parseChangePath = (
    path: string,
): { name: string | null; key: string | null } => {
    const part = parseModelPartPath(path);
    if (part === null || part.part === 'model')
        return { name: null, key: null };
    if (part.part === 'key') return { name: null, key: part.key };
    return { name: part.name, key: part.key };
};

const WHOLE_PART_VERBS: Record<ModelFragmentChange['action'], string> = {
    created: 'Adds',
    added: 'Adds',
    patched: 'Updates',
    redefined: 'Redefines',
    removed: 'Removes',
};

/** A change in words, one line per thing it touches: `Redefines <field>: sql, label`. */
export const summarizeModelChanges = (
    model: string,
    changes: ModelFragmentChange[],
): string[] => {
    const whole: string[] = [];
    const partial = new Map<string, { keys: string[]; redefines: boolean }>();
    changes.forEach(({ path, action }) => {
        const { name, key } = isWholeModelPath(model, path)
            ? { name: model, key: null }
            : parseChangePath(path);
        if (key === null) {
            whole.push(`${WHOLE_PART_VERBS[action]} ${name ?? path}`);
            return;
        }
        const target = name ?? model;
        const entry = partial.get(target) ?? { keys: [], redefines: false };
        entry.keys.push(key);
        entry.redefines ||= action === 'redefined';
        partial.set(target, entry);
    });
    return [
        ...whole,
        ...[...partial].map(
            ([target, { keys, redefines }]) =>
                `${redefines ? 'Redefines' : 'Updates'} ${target}: ${keys.join(', ')}`,
        ),
    ];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

type FieldChangeKind = 'dimension' | 'metric' | 'join' | 'model';

/** One thing a change touched, in the words of the semantic layer. */
export type FieldChange = {
    kind: FieldChangeKind;
    name: string;
    change: ChangeKind;
    label: string;
    /** Its declared type, such as `sum` or `date`; null for a join, the model, or a field that declares none. */
    type: string | null;
    /** How it is defined when new, or which keys changed; null when removed. */
    detail: string | null;
};

const kindOfPath = (path: string): FieldChangeKind => {
    const part = parseModelPartPath(path);
    if (part?.part !== 'entry') return 'model';
    switch (part.group) {
        case 'joins':
            return 'join';
        case 'metrics':
            return 'metric';
        case 'dimensions':
        case 'additional_dimensions':
            return 'dimension';
        default:
            return assertUnreachable(part, 'Unknown model part');
    }
};

const loadRecord = (content: string | null): Record<string, unknown> => {
    try {
        const parsed: unknown = content === null ? null : load(content);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const namedIn = (list: unknown, key: string, name: string) =>
    Array.isArray(list)
        ? list.find((item) => isRecord(item) && item[key] === name)
        : undefined;

/** A field's or join's definition in a model document, and the dimension it hangs off when it is a nested metric. */
const findDefinition = (
    doc: Record<string, unknown>,
    kind: FieldChangeKind,
    name: string,
): { part: Record<string, unknown>; parent: string | null } | null => {
    if (kind === 'model') return { part: doc, parent: null };
    if (kind === 'join') {
        const join =
            namedIn(doc.joins, 'alias', name) ??
            namedIn(doc.joins, 'join', name);
        return isRecord(join) ? { part: join, parent: null } : null;
    }
    const dimensions: unknown[] = Array.isArray(doc.dimensions)
        ? doc.dimensions
        : [];
    if (kind === 'dimension') {
        const own = namedIn(dimensions, 'name', name);
        if (isRecord(own)) return { part: own, parent: null };
    }
    const group = kind === 'metric' ? 'metrics' : 'additional_dimensions';
    const topLevel = isRecord(doc[group]) ? doc[group][name] : undefined;
    if (isRecord(topLevel)) return { part: topLevel, parent: null };
    const nested = dimensions.filter(isRecord).find((dimension) => {
        const parts = dimension[group];
        return isRecord(parts) && isRecord(parts[name]);
    });
    const parts = nested?.[group];
    return nested && isRecord(parts) && isRecord(parts[name])
        ? { part: parts[name], parent: String(nested.name) }
        : null;
};

const SQL_REFERENCE = /^\$\{(\w+)\}$/;

const describeNew = (
    kind: FieldChangeKind,
    definition: { part: Record<string, unknown>; parent: string | null },
): string | null => {
    const { part, parent } = definition;
    const type = typeof part.type === 'string' ? part.type : null;
    if (kind !== 'metric') return type;
    const sql = typeof part.sql === 'string' ? part.sql.trim() : '';
    const of = SQL_REFERENCE.exec(sql)?.[1] ?? parent;
    return [type, of ? `of ${of}` : null].filter(Boolean).join(' ') || null;
};

const CHANGE_OF_ACTION: Record<ModelFragmentChange['action'], ChangeKind> = {
    created: 'new',
    added: 'new',
    patched: 'changed',
    redefined: 'changed',
    removed: 'removed',
};

/** The fields, joins and model keys a proposal touched, labelled from the model before or after it. */
export const listFieldChanges = (
    model: string,
    changes: ModelFragmentChange[],
    content: { contentBefore: string | null; contentAfter: string | null },
): FieldChange[] => {
    const touched = new Map<
        string,
        {
            kind: FieldChangeKind;
            name: string;
            change: ChangeKind;
            keys: string[];
        }
    >();
    changes.forEach(({ path, action }) => {
        // A whole model being created or removed is the model's own header, not a row.
        if (isWholeModelPath(model, path)) return;
        const { name, key } = parseChangePath(path);
        const kind = kindOfPath(path);
        const id = `${kind}:${name ?? model}`;
        const entry = touched.get(id) ?? {
            kind,
            name: name ?? model,
            change: key === null ? CHANGE_OF_ACTION[action] : 'changed',
            keys: [],
        };
        if (key === null) entry.change = CHANGE_OF_ACTION[action];
        else if (!entry.keys.includes(key)) entry.keys.push(key);
        touched.set(id, entry);
    });
    const before = loadRecord(content.contentBefore);
    const after = loadRecord(content.contentAfter);
    return [...touched.values()].map(({ kind, name, change, keys }) => {
        const definition = findDefinition(
            change === 'removed' ? before : after,
            kind,
            name,
        );
        const label = definition?.part.label;
        const type = definition?.part.type;
        return {
            kind,
            name,
            change,
            label: typeof label === 'string' ? label : name,
            type:
                (kind === 'dimension' || kind === 'metric') &&
                typeof type === 'string'
                    ? type
                    : null,
            detail:
                change === 'removed'
                    ? null
                    : change === 'new' && definition
                      ? describeNew(kind, definition)
                      : keys.join(', ') || null,
        };
    });
};

const countMetrics = (part: unknown): number => {
    if (!isRecord(part)) return 0;
    if (Array.isArray(part.metrics)) return part.metrics.length;
    return isRecord(part.metrics) ? Object.keys(part.metrics).length : 0;
};

type ModelSummary = {
    label: string | null;
    dimensions: number;
    metrics: number;
} | null;

// The review asks for the same documents on every render; cleared when it grows, an LRU if drafts get large.
const summaries = new Map<string, ModelSummary>();

const readModelSummary = (content: string): ModelSummary => {
    try {
        const parsed: unknown = load(content);
        if (!isRecord(parsed)) return null;
        const dimensions = Array.isArray(parsed.dimensions)
            ? parsed.dimensions
            : [];
        return {
            label: typeof parsed.label === 'string' ? parsed.label : null,
            dimensions: dimensions.length,
            metrics: dimensions.reduce<number>(
                (total, dimension) => total + countMetrics(dimension),
                countMetrics(parsed),
            ),
        };
    } catch {
        return null;
    }
};

const parseModel = (content: string): ModelSummary => {
    const known = summaries.get(content);
    if (known !== undefined) return known;
    if (summaries.size > 200) summaries.clear();
    const summary = readModelSummary(content);
    summaries.set(content, summary);
    return summary;
};

export const count = (amount: number, noun: string) =>
    `${amount} ${noun}${amount === 1 ? '' : 's'}`;

const CHANGE_KIND_PAST: Record<ChangeKind, string> = {
    new: 'Added',
    changed: 'Changed',
    removed: 'Removed',
};

/** A change's fields in a sentence each: "Added 2 metrics: Revenue, Orders. Changed 1 dimension: Status". */
export const describeFieldChanges = (fields: FieldChange[]): string =>
    (['new', 'changed', 'removed'] as const)
        .flatMap((change) =>
            (['metric', 'dimension', 'join', 'model'] as const).flatMap(
                (kind) => {
                    const hits = fields.filter(
                        (field) =>
                            field.change === change && field.kind === kind,
                    );
                    if (hits.length === 0) return [];
                    // A model's own keys have no name of their own to list.
                    if (kind === 'model') {
                        return [
                            `${CHANGE_KIND_PAST[change]} its ${hits[0].detail ?? 'settings'}`,
                        ];
                    }
                    return [
                        `${CHANGE_KIND_PAST[change]} ${count(hits.length, kind)}: ${hits.map(({ label }) => label).join(', ')}`,
                    ];
                },
            ),
        )
        .join('. ');

/** A whole model added, with what it holds, or removed. */
export type WholeModelChange =
    | { kind: 'new'; counts: string[] }
    | { kind: 'removed' };

/** A model's title and, when it is new or removed, what happened to it, in words and as data. */
export const describeModelChange = (
    model: string,
    change: ContentChange | null,
): {
    title: string;
    subtitle: string | null;
    whole: WholeModelChange | null;
} => {
    const parsed = parseModel(
        change?.contentAfter ?? change?.contentBefore ?? '',
    );
    const title = parsed?.label ?? model;
    const kind = change ? getChangeKind(change) : 'changed';
    if (kind === 'removed') {
        return {
            title,
            subtitle: CHANGE_KIND_LABELS.removed,
            whole: { kind: 'removed' },
        };
    }
    if (kind === 'changed' || !parsed) {
        return { title, subtitle: null, whole: null };
    }
    const counts = [
        count(parsed.dimensions, 'dimension'),
        count(parsed.metrics, 'metric'),
    ];
    return {
        title,
        subtitle: [CHANGE_KIND_LABELS.new, ...counts].join(' · '),
        whole: { kind: 'new', counts },
    };
};

/** How many lines a change adds and removes, as a diff counts them. */
export const countChangedLines = ({
    contentBefore,
    contentAfter,
}: ContentChange): { additions: number; deletions: number } => {
    const { hunks } = parseDiffFromFile(
        { name: 'model.yml', contents: contentBefore ?? '' },
        { name: 'model.yml', contents: contentAfter ?? '' },
    );
    return {
        additions: hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
        deletions: hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    };
};

/** Where a peek at a model's YAML starts: its metrics are what people came to see. */
export const findPeekStart = (lines: string[]): number =>
    Math.max(
        lines.findIndex((line) => line.trim() === 'metrics:'),
        0,
    );

/** The fields, joins and model keys the draft touches on one model, as its card and its review list them. */
export const listPublishedParts = (
    draft: SemanticLayerDraft,
    entry: SemanticLayerDraftModel,
): FieldChange[] =>
    // A model new as a whole is one change, however many edits built it.
    getChangeKind(entry) === 'new'
        ? []
        : listFieldChanges(
              entry.model,
              draft.changes.flatMap(({ models }) =>
                  models
                      .filter(
                          ({ model, error }) =>
                              model === entry.model && error === null,
                      )
                      .flatMap(({ changes }) => changes),
              ),
              entry,
          );

/** How many changes a publish carries: each part touched, and each model added or removed whole. */
export const countPublishedChanges = (
    draft: SemanticLayerDraft,
    model: string | null,
): number =>
    draft.models
        .filter((entry) => model === null || entry.model === model)
        .reduce(
            (total, entry) =>
                total + Math.max(listPublishedParts(draft, entry).length, 1),
            0,
        );
