export type ContentDraftFieldResolution = 'mine' | 'latest';

export type ContentDraftStaleness = {
    draftUuid: string;
    // As-code fields the repo changed since the draft's base
    changedFields: string[];
    // The subset the draft also changed; whole-field conflicts
    conflictingFields: string[];
};

// Draft overlays are stored in DAO shape; snapshots are as-code documents
const OVERLAY_TO_AS_CODE_FIELD: Record<
    'chart' | 'dashboard',
    Record<string, string>
> = {
    chart: {
        name: 'name',
        description: 'description',
        tableName: 'tableName',
        metricQuery: 'metricQuery',
        chartConfig: 'chartConfig',
        tableConfig: 'tableConfig',
        pivotConfig: 'pivotConfig',
        parameters: 'parameters',
        merge: 'merge',
        spaceUuid: 'spaceSlug',
    },
    dashboard: {
        name: 'name',
        description: 'description',
        tiles: 'tiles',
        filters: 'filters',
        tabs: 'tabs',
        config: 'config',
        parameters: 'parameters',
        spaceUuid: 'spaceSlug',
    },
};

export const overlayKeysForAsCodeField = (
    contentType: 'chart' | 'dashboard',
    field: string,
): string[] =>
    Object.entries(OVERLAY_TO_AS_CODE_FIELD[contentType])
        .filter(([, asCodeField]) => asCodeField === field)
        .map(([overlayKey]) => overlayKey);

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// Snapshots are canonical (sorted keys, no undefined), so string equality
// is structural equality
export const asCodeFieldsChangedBetween = (
    base: unknown,
    current: unknown,
): string[] => {
    const baseDoc = isObject(base) ? base : {};
    const currentDoc = isObject(current) ? current : {};
    const keys = new Set([...Object.keys(baseDoc), ...Object.keys(currentDoc)]);
    return Array.from(keys)
        .filter(
            (key) =>
                JSON.stringify(baseDoc[key]) !==
                JSON.stringify(currentDoc[key]),
        )
        .sort();
};

export const computeContentDraftStaleness = ({
    draftUuid,
    contentType,
    base,
    current,
    overlay,
}: {
    draftUuid: string;
    contentType: 'chart' | 'dashboard';
    base: unknown;
    current: unknown;
    overlay: unknown;
}): ContentDraftStaleness => {
    const changedFields = asCodeFieldsChangedBetween(base, current);
    const overlayKeys = isObject(overlay) ? Object.keys(overlay) : [];
    const draftedFields = new Set(
        overlayKeys.flatMap((key) => {
            const field = OVERLAY_TO_AS_CODE_FIELD[contentType][key];
            return field === undefined ? [] : [field];
        }),
    );
    return {
        draftUuid,
        changedFields,
        conflictingFields: changedFields.filter((field) =>
            draftedFields.has(field),
        ),
    };
};

export type ContentDraftFieldChange = {
    field: string;
    // What the repo did to the field since the draft's base
    repo: string;
    // What the draft did to the same field, when it also changed it
    mine: string | null;
};

export type ContentDraftStalenessDetails = ContentDraftStaleness & {
    changes: ContentDraftFieldChange[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
    isObject(value) ? value : null;

const tileIdentity = (tile: Record<string, unknown>): string => {
    if (typeof tile.tileSlug === 'string') return tile.tileSlug;
    const properties = asRecord(tile.properties) ?? {};
    const handle =
        properties.chartSlug ?? properties.title ?? properties.appSlug ?? '';
    return `${String(tile.type)}:${String(handle)}`;
};

const tileLabel = (tile: Record<string, unknown>): string => {
    const properties = asRecord(tile.properties) ?? {};
    const label =
        properties.title ?? properties.chartName ?? properties.chartSlug;
    return typeof label === 'string' && label !== ''
        ? label
        : `untitled ${String(tile.type ?? 'tile').replace(/_/g, ' ')}`;
};

const quote = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'empty';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 48 ? `"${text.slice(0, 45)}…"` : `"${text}"`;
};

const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

const describeKeyedList = (
    before: unknown[],
    after: unknown[],
    noun: string,
    identity: (item: Record<string, unknown>) => string,
    label: (item: Record<string, unknown>) => string,
    // Documents rendered by different producers differ in incidental shape,
    // so edits inside surviving items are only reported when asked
    reportEdits: boolean,
): string => {
    const beforeItems = new Map(
        before.flatMap((item) => {
            const record = asRecord(item);
            return record ? [[identity(record), record] as const] : [];
        }),
    );
    const afterItems = new Map(
        after.flatMap((item) => {
            const record = asRecord(item);
            return record ? [[identity(record), record] as const] : [];
        }),
    );
    const added = [...afterItems]
        .filter(([key]) => !beforeItems.has(key))
        .map(([, item]) => label(item));
    const removed = [...beforeItems]
        .filter(([key]) => !afterItems.has(key))
        .map(([, item]) => label(item));
    const changed = reportEdits
        ? [...afterItems]
              .filter(
                  ([key, item]) =>
                      beforeItems.has(key) &&
                      JSON.stringify(beforeItems.get(key)) !==
                          JSON.stringify(item),
              )
              .map(([, item]) => label(item))
        : [];
    const parts = [
        added.length > 0 &&
            `added ${plural(added.length, noun)} (${added.join(', ')})`,
        removed.length > 0 &&
            `removed ${plural(removed.length, noun)} (${removed.join(', ')})`,
        changed.length > 0 &&
            `changed ${plural(changed.length, noun)} (${changed.join(', ')})`,
    ].filter((part): part is string => typeof part === 'string');
    return parts.length > 0 ? parts.join('; ') : `edited ${noun}s`;
};

// A one-line, human account of how a field moved between two documents
export const describeAsCodeFieldChange = (
    field: string,
    before: unknown,
    after: unknown,
    options: { reportEdits: boolean } = { reportEdits: true },
): string => {
    if (before === undefined) return `set to ${quote(after)}`;
    if (after === undefined) return 'removed';
    if (field === 'tiles' && Array.isArray(before) && Array.isArray(after)) {
        return describeKeyedList(
            before,
            after,
            'tile',
            tileIdentity,
            tileLabel,
            options.reportEdits,
        );
    }
    if (field === 'tabs' && Array.isArray(before) && Array.isArray(after)) {
        return describeKeyedList(
            before,
            after,
            'tab',
            (tab) => String(tab.slug ?? tab.uuid ?? tab.name),
            (tab) => String(tab.name ?? 'tab'),
            options.reportEdits,
        );
    }
    if (typeof before !== 'object' || typeof after !== 'object') {
        return `${quote(before)} → ${quote(after)}`;
    }
    const changedKeys = asCodeFieldsChangedBetween(before, after);
    return changedKeys.length > 0
        ? `changed ${changedKeys.join(', ')}`
        : 'changed';
};

export const describeContentDraftStaleness = ({
    staleness,
    base,
    current,
    draft,
}: {
    staleness: ContentDraftStaleness;
    base: unknown;
    current: unknown;
    draft: unknown;
}): ContentDraftStalenessDetails => {
    const baseDoc = asRecord(base) ?? {};
    const currentDoc = asRecord(current) ?? {};
    const draftDoc = asRecord(draft) ?? {};
    return {
        ...staleness,
        changes: staleness.changedFields.map((field) => ({
            field,
            repo: describeAsCodeFieldChange(
                field,
                baseDoc[field],
                currentDoc[field],
            ),
            // The draft is rendered by the instance, the base by the CLI
            mine: staleness.conflictingFields.includes(field)
                ? describeAsCodeFieldChange(
                      field,
                      baseDoc[field],
                      draftDoc[field],
                      { reportEdits: false },
                  )
                : null,
        })),
    };
};
