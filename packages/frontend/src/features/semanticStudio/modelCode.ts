import {
    assertUnreachable,
    type ModelFragmentChange,
    type ModelFragmentRefusal,
    type SemanticLayerModelChange,
} from '@lightdash/common';
import { load } from 'js-yaml';

export const VIEW_PARAM = 'view';
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

export const changeTitle = ({
    source,
    question,
}: Pick<SemanticLayerModelChange, 'source' | 'question'>): string => {
    switch (source) {
        case 'draft':
            return question ?? 'Applied a draft';
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
): string => `Left out ${model}.${path} (${reason.replaceAll('_', ' ')})`;

/** The field or join a change path names, and the key changed on it; a null key means the whole thing. */
const parseChangePath = (
    path: string,
): { name: string | null; key: string | null } => {
    const [head, first, second, third, fourth] = path.split('.');
    if (head === 'joins' || head === 'metrics') {
        return { name: first ?? null, key: second ?? null };
    }
    if (head !== 'dimensions') return { name: null, key: head };
    return second === 'metrics' || second === 'additional_dimensions'
        ? { name: third ?? null, key: fourth ?? null }
        : { name: first ?? null, key: second ?? null };
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
        const { name, key } =
            path === model ? { name: model, key: null } : parseChangePath(path);
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

const countMetrics = (part: unknown): number => {
    if (!isRecord(part)) return 0;
    if (Array.isArray(part.metrics)) return part.metrics.length;
    return isRecord(part.metrics) ? Object.keys(part.metrics).length : 0;
};

const parseModel = (
    content: string,
): { label: string | null; dimensions: number; metrics: number } | null => {
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

export const count = (amount: number, noun: string) =>
    `${amount} ${noun}${amount === 1 ? '' : 's'}`;

/** A model's title and, when it is new or removed, what happened to it, in words. */
export const describeModelChange = (
    model: string,
    change: ContentChange | null,
): { title: string; subtitle: string | null } => {
    const parsed = parseModel(
        change?.contentAfter ?? change?.contentBefore ?? '',
    );
    const title = parsed?.label ?? model;
    const kind = change ? getChangeKind(change) : 'changed';
    if (kind === 'removed') {
        return { title, subtitle: CHANGE_KIND_LABELS.removed };
    }
    if (kind === 'changed' || !parsed) return { title, subtitle: null };
    return {
        title,
        subtitle: `${CHANGE_KIND_LABELS.new} · ${count(parsed.dimensions, 'dimension')} · ${count(parsed.metrics, 'metric')}`,
    };
};

/** Where a peek at a model's YAML starts: its metrics are what people came to see. */
export const findPeekStart = (lines: string[]): number =>
    Math.max(
        lines.findIndex((line) => line.trim() === 'metrics:'),
        0,
    );
