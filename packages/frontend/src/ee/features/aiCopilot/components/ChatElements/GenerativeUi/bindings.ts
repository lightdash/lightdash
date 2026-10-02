import {
    assertUnreachable,
    parseGenerativeUiRef,
    type GenerativeUiLeafBlock,
    type GenerativeUiOptions,
    type GenerativeUiRefTarget,
    type GenerativeUiState,
    type GenerativeUiValue,
} from '@lightdash/common';

export type GenerativeUiBindingContext = {
    state: GenerativeUiState;
    queries: ReadonlyMap<string, unknown>;
    results: ReadonlyMap<string, unknown>;
    item: { value: unknown } | null;
};

export type GenerativeUiOption = { label: string; value: string };

type TableRows = Extract<GenerativeUiLeafBlock, { type: 'table' }>['rows'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// Only own keys, so a path such as "constructor" never reaches the prototype.
const ownValue = (record: Readonly<Record<string, unknown>>, key: string) =>
    Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** Reads a dotted path ("" is the value itself); undefined when it is missing. */
export const readPath = (value: unknown, path: string): unknown =>
    path === ''
        ? value
        : path.split('.').reduce<unknown>((current, segment) => {
              if (Array.isArray(current)) {
                  const items: unknown[] = current;
                  return /^\d+$/.test(segment)
                      ? items[Number(segment)]
                      : undefined;
              }
              return isRecord(current) ? ownValue(current, segment) : undefined;
          }, value);

/** Resolves a reference; undefined when its source is not available yet. */
export const resolveRef = (
    target: GenerativeUiRefTarget,
    context: GenerativeUiBindingContext,
): unknown => {
    switch (target.kind) {
        case 'state':
            return ownValue(context.state, target.key);
        case 'query':
            return readPath(context.queries.get(target.queryId), target.path);
        case 'result':
            return readPath(context.results.get(target.stepId), target.path);
        case 'item':
            return context.item === null
                ? undefined
                : readPath(context.item.value, target.path);
        default:
            return assertUnreachable(target, 'Unknown generative UI reference');
    }
};

/** Replaces every reference inside a spec value with its current value. */
export const resolveValue = (
    value: GenerativeUiValue,
    context: GenerativeUiBindingContext,
): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        return value.map((item) => resolveValue(item, context));
    }
    const target = parseGenerativeUiRef(value);
    if (target !== null) return resolveRef(target, context);
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
            key,
            child === undefined ? undefined : resolveValue(child, context),
        ]),
    );
};

/** Every reference inside a spec value. */
export const refsIn = (value: GenerativeUiValue): GenerativeUiRefTarget[] => {
    if (value === null || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(refsIn);
    const target = parseGenerativeUiRef(value);
    if (target !== null) return [target];
    return Object.values(value).flatMap((child) =>
        child === undefined ? [] : refsIn(child),
    );
};

/** A value a query can be sent with: not missing, null, '' or []. */
export const isPresent = (value: unknown): boolean =>
    value !== undefined &&
    value !== null &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0);

const optionText = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return null;
};

/** Static options as written, or options read from a loaded query. */
export const resolveOptions = (
    options: GenerativeUiOptions,
    queries: ReadonlyMap<string, unknown>,
):
    | { status: 'ready'; options: GenerativeUiOption[] }
    | { status: 'waiting' } => {
    if (Array.isArray(options)) return { status: 'ready', options };
    if (!queries.has(options.$query)) return { status: 'waiting' };
    const items = readPath(queries.get(options.$query), options.path ?? '');
    if (!Array.isArray(items)) return { status: 'ready', options: [] };
    const list: unknown[] = items;
    const byValue = new Map<string, GenerativeUiOption>();
    list.forEach((item) => {
        const value = optionText(readPath(item, options.value));
        if (value === null || byValue.has(value)) return;
        byValue.set(value, {
            value,
            label: optionText(readPath(item, options.label)) ?? value,
        });
    });
    return { status: 'ready', options: Array.from(byValue.values()) };
};

/** Literal rows as written, or row objects read from a loaded query. */
export const resolveRows = (
    rows: TableRows,
    queries: ReadonlyMap<string, unknown>,
):
    | { status: 'ready'; rows: Record<string, unknown>[] }
    | { status: 'waiting' } => {
    if (Array.isArray(rows)) return { status: 'ready', rows };
    if (!queries.has(rows.$query)) return { status: 'waiting' };
    const value = readPath(queries.get(rows.$query), rows.path ?? '');
    if (!Array.isArray(value)) return { status: 'ready', rows: [] };
    const list: unknown[] = value;
    return { status: 'ready', rows: list.filter(isRecord) };
};
