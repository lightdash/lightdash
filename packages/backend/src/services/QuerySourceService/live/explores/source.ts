import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getItemId,
    MetricType,
    UnexpectedServerError,
    type LiveSourceRefreshSummary,
} from '@lightdash/common';
import { z } from 'zod';
import { extendLiveModel, isLiveModelName } from '../integration';
import { getLiveIntegration, isLiveIntegrationRegistered } from '../registry';
import { type LiveExtension, type LiveExtraFields } from '../types';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
} from './definition';
import {
    getLiveExploreEdit,
    getLiveFieldEditKey,
    type LiveSourceExploreEdits,
    type LiveSourceFieldEdit,
    type LiveSourceFieldEdits,
} from './fields';

/**
 * A source's explores: the ones its integration declares, with what its
 * `extend` adds:
 *
 * - a Refresh stores the metadata the vendor reported (`scan.metadata`),
 *   not explores; each build turns it into explores with the integration's
 *   `extend`, so a deploy changes every source without a Refresh
 * - a declared explore always comes from the code, with the fields the
 *   metadata adds after its own
 * - every explore has a `name`, its one identity. One that `extend` adds
 *   is left out when its name isn't a model name, or another explore has
 *   it
 * - every explore and field is on as an admin set it, else as its
 *   definition's `onByDefault` (on when absent). A Refresh that sees the
 *   vendor change a default keeps the state the source had, and a deploy
 *   that turns a default off keeps on what the source has built. A default
 *   that turns on in code shows the item
 */

/** What a Refresh stored: the vendor's metadata, as the model's `scan` returned it. */
export type LiveSourceScan = {
    /** ISO timestamp of the Refresh. */
    at: string;
    metadata: unknown;
};

/** What the `lastScan` of a source last refreshed before metadata was stored adds. */
export type LiveSourceLegacyScan = {
    at: string;
    extension: LiveExtension;
};

/** How a source's explores and fields are curated, as stored next to its settings. */
export type LiveSourceFieldState = {
    /** Null before the first Refresh of an integration that scans. */
    scan: LiveSourceScan | null;
    /** Read only, never written: a source's `lastScan` from before metadata was stored, until its next Refresh. */
    legacy: LiveSourceLegacyScan | null;
    fields: LiveSourceFieldEdits;
    explores: LiveSourceExploreEdits;
    aiHint: string | null;
    targetLabel: string | null;
    /** Tags the source's explores carry, for AI agents limited to tags. */
    tags: string[];
};

/** One explore of a source, named and with its fields merged, ready to curate and build. */
export type LiveSourceModel = {
    /** The model name; the explore is `<source prefix>_<name>`. */
    name: string;
    /** The model its field edits are keyed under; null for the first declared explore. */
    editModel: string | null;
    definition: LiveExploreDefinition;
    /** Declared in the integration's code, so a deploy rebuilds it. */
    isDeclared: boolean;
    /** The fields the code declares, as opposed to ones a Refresh found. */
    declaredNames: ReadonlySet<string>;
    onByDefault: boolean;
};

const fieldSchema = z
    .object({
        name: z.string().min(1),
        apiName: z.string().min(1),
        label: z.string(),
        description: z.string().optional(),
        filterOperators: z.array(z.nativeEnum(FilterOperator)),
        onByDefault: z.boolean().optional(),
    })
    .passthrough();

const exploreSchema = z
    .object({
        name: z.string().min(1),
        apiName: z.string().min(1).optional(),
        onByDefault: z.boolean().optional(),
        label: z.string(),
        description: z.string(),
        dimensions: z.array(
            fieldSchema.extend({ type: z.nativeEnum(DimensionType) }),
        ),
        metrics: z.array(
            fieldSchema.extend({ type: z.nativeEnum(MetricType) }),
        ),
        maxDimensions: z.number().nullable(),
        maxMetrics: z.number().nullable(),
        dateRange: z
            .object({ dimension: z.string(), defaultDays: z.number() })
            .nullable(),
        incompatible: z.array(z.object({}).passthrough()),
    })
    .passthrough();

const extensionSchema = z.object({
    fields: z
        .record(
            z.string(),
            z.object({
                dimensions: z.array(
                    fieldSchema.extend({ type: z.nativeEnum(DimensionType) }),
                ),
                metrics: z.array(
                    fieldSchema.extend({ type: z.nativeEnum(MetricType) }),
                ),
            }),
        )
        .optional(),
    explores: z.array(exploreSchema).optional(),
}) as unknown as z.ZodType<LiveExtension>;

/**
 * Whether an id can sit in one path segment of an access rule as it is: no
 * `/`, which would add segments, and no `{` or `}`, which would make the
 * segment match anything.
 */
const isPathSafe = (id: string) => !/[/{}?#\s%]/.test(id);

/**
 * What an extension gives a source, and the names of the explores left out
 * of it. Fields count only for an explore the model declares. An explore is
 * left out when:
 *
 * - its name isn't a model name, so it can't be part of an explore name
 * - its `apiName` can't be one path segment, so it could widen the source's
 *   access
 * - a declared explore, or an earlier one, has its name
 */
const keepLiveExtension = (
    connector: ApiConnectorType,
    extension: LiveExtension,
): { extension: Required<LiveExtension>; dropped: string[] } => {
    const declared = new Set(
        getLiveIntegration(connector).model.explores.map(({ name }) => name),
    );
    const fields = Object.fromEntries(
        Object.entries(extension.fields ?? {}).filter(([name]) =>
            declared.has(name),
        ),
    );
    const seen = new Set(declared);
    return (extension.explores ?? []).reduce<{
        extension: Required<LiveExtension>;
        dropped: string[];
    }>(
        (result, explore) => {
            const isKept =
                isLiveModelName(explore.name) &&
                (explore.apiName === undefined ||
                    isPathSafe(explore.apiName)) &&
                !seen.has(explore.name);
            seen.add(explore.name);
            return isKept
                ? {
                      ...result,
                      extension: {
                          fields,
                          explores: [...result.extension.explores, explore],
                      },
                  }
                : { ...result, dropped: [...result.dropped, explore.name] };
        },
        { extension: { fields, explores: [] }, dropped: [] },
    );
};

/**
 * What `extend` returned at a Refresh, checked: the names of the explores
 * left out. Refuses another shape, and fields for an explore the model
 * doesn't declare, which is a mistake in the integration.
 */
export const checkLiveExtension = (
    connector: ApiConnectorType,
    extension: unknown,
): { dropped: string[] } => {
    const { label, model } = getLiveIntegration(connector);
    const parsed = extensionSchema.safeParse(extension);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            `${label} reported its explores in an unexpected shape`,
        );
    }
    const declared = new Set(model.explores.map(({ name }) => name));
    const unknown = Object.keys(parsed.data.fields ?? {}).filter(
        (name) => !declared.has(name),
    );
    if (unknown.length > 0) {
        throw new UnexpectedServerError(
            `${label} reported fields for explores it doesn't have: ${unknown.join(', ')}`,
        );
    }
    return { dropped: keepLiveExtension(connector, parsed.data).dropped };
};

/**
 * What a source's stored metadata adds, or its old scan; nothing before its
 * first Refresh. The same explores are left out as at Refresh.
 */
export const getLiveExtension = (
    connector: ApiConnectorType,
    state: Pick<LiveSourceFieldState, 'scan'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): Required<LiveExtension> =>
    keepLiveExtension(
        connector,
        state.scan
            ? (extendLiveModel(
                  getLiveIntegration(connector).model,
                  state.scan.metadata,
              ) ?? {})
            : (state.legacy?.extension ?? {}),
    ).extension;

const legacyFieldSchema = z.object({
    name: z.string(),
    apiName: z.string(),
    label: z.string(),
    description: z.string().optional(),
    filterOperators: z.array(z.nativeEnum(FilterOperator)),
    sql: z.string().optional(),
    valueLabels: z.record(z.string(), z.string()).optional(),
});

/** The stored scan of sources last refreshed before explores were stored whole. */
const legacyScanSchema = z.object({
    scannedAt: z.string(),
    fields: z.array(
        z.discriminatedUnion('kind', [
            z.object({
                kind: z.literal('dimension'),
                definition: legacyFieldSchema.extend({
                    type: z.nativeEnum(DimensionType),
                }),
                isInternal: z.boolean(),
                model: z.string().optional(),
            }),
            z.object({
                kind: z.literal('metric'),
                definition: legacyFieldSchema.extend({
                    type: z.nativeEnum(MetricType),
                    format: z.string().optional(),
                }),
                isInternal: z.boolean(),
                model: z.string().optional(),
            }),
        ]),
    ),
});

const editorSchema = z.object({
    userUuid: z.string(),
    userName: z.string(),
    at: z.string(),
});

const fieldStateSchema = z.object({
    connector: z.nativeEnum(ApiConnectorType).optional().catch(undefined),
    aiHint: z.string().nullish().catch(null),
    targetLabel: z.string().nullish().catch(null),
    tags: z.array(z.string()).nullish().catch(null),
    scan: z
        .object({ at: z.string(), metadata: z.unknown() })
        .nullish()
        .catch(null),
    lastScan: legacyScanSchema.nullish(),
    fields: z
        .record(
            z.string(),
            z.object({
                inUse: z.boolean().optional(),
                label: z.string().optional(),
                description: z.string().optional(),
                aiHint: z.string().optional(),
                group: z.string().nullable().optional(),
                lastEdit: editorSchema.nullable(),
            }),
        )
        .nullish(),
    explores: z
        .record(
            z.string(),
            z.object({
                inUse: z.boolean().optional(),
                label: z.string().optional(),
                description: z.string().optional(),
                aiHint: z.string().optional(),
                lastEdit: editorSchema.nullish(),
            }),
        )
        .nullish()
        .catch(null),
});

const EMPTY_STATE: LiveSourceFieldState = {
    scan: null,
    legacy: null,
    fields: {},
    explores: {},
    aiHint: null,
    targetLabel: null,
    tags: [],
};

/**
 * A stored scan read as what it adds. Its fields keep the state they had:
 * all on when the source was never curated (`fields` absent), else on only
 * when an admin turned them on. Their default is on unless the vendor marked
 * them as its own bookkeeping, so edits pin the fields whose state differs.
 */
const fromLegacyScan = (
    connector: ApiConnectorType,
    scan: z.infer<typeof legacyScanSchema>,
    storedEdits: LiveSourceFieldEdits | null,
): { legacy: LiveSourceLegacyScan; fields: LiveSourceFieldEdits } => {
    const [first] = getLiveIntegration(connector).model.explores;
    const byModel = new Map<string, LiveExtraFields>();
    const pins: LiveSourceFieldEdits = {};
    scan.fields.forEach((field) => {
        const model = field.model ?? first.name;
        const group = byModel.get(model) ?? { dimensions: [], metrics: [] };
        byModel.set(model, group);
        const onByDefault = !field.isInternal;
        if (field.kind === 'dimension') {
            group.dimensions.push({ ...field.definition, onByDefault });
        } else {
            group.metrics.push({ ...field.definition, onByDefault });
        }
        const key = getLiveFieldEditKey(
            field.model ?? null,
            field.definition.name,
        );
        const edit = storedEdits?.[key];
        const inUse = storedEdits === null;
        if (edit?.inUse === undefined && inUse !== onByDefault) {
            pins[key] = { ...edit, inUse, lastEdit: edit?.lastEdit ?? null };
        }
    });
    return {
        legacy: {
            at: scan.scannedAt,
            extension: { fields: Object.fromEntries(byModel) },
        },
        fields: { ...storedEdits, ...pins },
    };
};

/** Reads the curation keys of a stored `api_source`; unreadable keys read as absent. */
export const parseLiveSourceFieldState = (
    apiSource: unknown,
): LiveSourceFieldState => {
    const parsed = fieldStateSchema.safeParse(apiSource);
    if (!parsed.success) {
        return EMPTY_STATE;
    }
    const { data } = parsed;
    const base = {
        ...EMPTY_STATE,
        explores: data.explores ?? {},
        aiHint: data.aiHint ?? null,
        targetLabel: data.targetLabel ?? null,
        tags: data.tags ?? [],
    };
    if (data.scan) {
        return {
            ...base,
            scan: { at: data.scan.at, metadata: data.scan.metadata },
            fields: data.fields ?? {},
        };
    }
    if (
        data.lastScan &&
        data.connector &&
        isLiveIntegrationRegistered(data.connector)
    ) {
        return {
            ...base,
            ...fromLegacyScan(
                data.connector,
                data.lastScan,
                data.fields ?? null,
            ),
        };
    }
    return { ...base, fields: data.fields ?? {} };
};

/** Whether a source has been refreshed: it stored metadata, or an old scan. */
export const hasLiveRefresh = (
    state: Pick<LiveSourceFieldState, 'scan'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): boolean => state.scan !== null || (state.legacy ?? null) !== null;

/**
 * Every explore of a source: the declared ones, each with the fields a
 * Refresh found after its own, then each one only the Refresh knows.
 */
export const getLiveSourceModels = (
    connector: ApiConnectorType,
    state: Pick<LiveSourceFieldState, 'scan'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): LiveSourceModel[] => {
    const declared = getLiveIntegration(connector).model.explores;
    const extension = getLiveExtension(connector, state);
    const fromCode = declared.map((definition, index): LiveSourceModel => {
        const fieldNames = new Set(
            [...definition.dimensions, ...definition.metrics].map(
                ({ name }) => name,
            ),
        );
        const added = Object.hasOwn(extension.fields, definition.name)
            ? extension.fields[definition.name]
            : undefined;
        const isNew = ({ name }: { name: string }) => !fieldNames.has(name);
        return {
            name: definition.name,
            editModel: index === 0 ? null : definition.name,
            definition: {
                ...definition,
                dimensions: [
                    ...definition.dimensions,
                    ...(added?.dimensions.filter(isNew) ?? []),
                ],
                metrics: [
                    ...definition.metrics,
                    ...(added?.metrics.filter(isNew) ?? []),
                ],
            },
            isDeclared: true,
            declaredNames: fieldNames,
            onByDefault: definition.onByDefault ?? true,
        };
    });
    const fromRefresh = extension.explores.map(
        (definition): LiveSourceModel => ({
            name: definition.name,
            editModel: definition.name,
            definition,
            isDeclared: false,
            declaredNames: new Set(),
            onByDefault: definition.onByDefault ?? true,
        }),
    );
    return [...fromCode, ...fromRefresh];
};

/** An edit holding the state an item had, keeping whatever else it set. */
const pinField = (
    edit: LiveSourceFieldEdit | undefined,
    inUse: boolean,
): LiveSourceFieldEdit => ({
    ...edit,
    inUse,
    lastEdit: edit?.lastEdit ?? null,
});

/**
 * Keeps each explore and field as the source had it when its default
 * changed at a Refresh, unless an admin already set it, so `onByDefault`
 * only counts the first time a source sees an item.
 */
export const pinLiveDefaults = ({
    previous,
    next,
    fields,
    explores,
}: {
    previous: LiveSourceModel[];
    next: LiveSourceModel[];
    fields: LiveSourceFieldEdits;
    explores: LiveSourceExploreEdits;
}): { fields: LiveSourceFieldEdits; explores: LiveSourceExploreEdits } =>
    next.reduce<{
        fields: LiveSourceFieldEdits;
        explores: LiveSourceExploreEdits;
    }>(
        (edits, model) => {
            const before = previous.find(({ name }) => name === model.name);
            if (!before) return edits;
            const exploreEdit = getLiveExploreEdit(edits.explores, model.name);
            const nextExplores =
                exploreEdit?.inUse === undefined &&
                before.onByDefault !== model.onByDefault
                    ? {
                          ...edits.explores,
                          [model.name]: {
                              ...exploreEdit,
                              inUse: before.onByDefault,
                              lastEdit: exploreEdit?.lastEdit ?? null,
                          },
                      }
                    : edits.explores;
            const defaults = new Map(
                [
                    ...before.definition.dimensions,
                    ...before.definition.metrics,
                ].map(({ name, onByDefault }) => [name, onByDefault ?? true]),
            );
            const nextFields = [
                ...model.definition.dimensions,
                ...model.definition.metrics,
            ].reduce<LiveSourceFieldEdits>((current, field) => {
                const was = defaults.get(field.name);
                const key = getLiveFieldEditKey(model.editModel, field.name);
                const edit: LiveSourceFieldEdit | undefined = Object.hasOwn(
                    current,
                    key,
                )
                    ? current[key]
                    : undefined;
                return was === undefined ||
                    edit?.inUse !== undefined ||
                    was === (field.onByDefault ?? true)
                    ? current
                    : { ...current, [key]: pinField(edit, was) };
            }, edits.fields);
            return { fields: nextFields, explores: nextExplores };
        },
        { fields, explores },
    );

/**
 * Edits that keep on what a source has built today when its default now
 * says off. A deploy can change a default in code, and that must not take
 * away an explore or a field people already use. An item an admin set is
 * left alone, and so is one the source hasn't built: a default that turns
 * on simply shows the item.
 */
export const pinBuiltLiveItems = ({
    models,
    toExploreName,
    builtExploreNames,
    builtFieldIds,
    fields,
    explores,
}: {
    models: LiveSourceModel[];
    toExploreName: (model: string) => string;
    builtExploreNames: readonly string[];
    builtFieldIds: readonly string[];
    fields: LiveSourceFieldEdits;
    explores: LiveSourceExploreEdits;
}): { fields: LiveSourceFieldEdits; explores: LiveSourceExploreEdits } => {
    const builtExplores = new Set(builtExploreNames);
    const builtFields = new Set(builtFieldIds);
    return models.reduce<{
        fields: LiveSourceFieldEdits;
        explores: LiveSourceExploreEdits;
    }>(
        (edits, model) => {
            const exploreName = toExploreName(model.name);
            if (!builtExplores.has(exploreName)) return edits;
            const exploreEdit = getLiveExploreEdit(edits.explores, model.name);
            const nextExplores =
                exploreEdit?.inUse === undefined && !model.onByDefault
                    ? {
                          ...edits.explores,
                          [model.name]: {
                              ...exploreEdit,
                              inUse: true,
                              lastEdit: exploreEdit?.lastEdit ?? null,
                          },
                      }
                    : edits.explores;
            const nextFields = [
                ...model.definition.dimensions,
                ...model.definition.metrics,
            ].reduce<LiveSourceFieldEdits>((current, field) => {
                const key = getLiveFieldEditKey(model.editModel, field.name);
                const edit: LiveSourceFieldEdit | undefined = Object.hasOwn(
                    current,
                    key,
                )
                    ? current[key]
                    : undefined;
                const isBuilt = builtFields.has(
                    getItemId({ table: exploreName, name: field.name }),
                );
                return isBuilt &&
                    edit?.inUse === undefined &&
                    field.onByDefault === false
                    ? { ...current, [key]: pinField(edit, true) }
                    : current;
            }, edits.fields);
            return { fields: nextFields, explores: nextExplores };
        },
        { fields, explores },
    );
};

/** What a Refresh changed: explores by name, and fields by explore. */
export const getLiveRefreshSummary = ({
    previous,
    next,
    toExploreName,
}: {
    previous: LiveSourceModel[];
    next: LiveSourceModel[];
    toExploreName: (model: string) => string;
}): LiveSourceRefreshSummary => {
    const fieldNames = (model: LiveSourceModel) =>
        [...model.definition.dimensions, ...model.definition.metrics].map(
            ({ name }) => name,
        );
    const missingFrom = (
        from: LiveSourceModel[],
        to: LiveSourceModel[],
    ): {
        explores: string[];
        fields: Record<string, string[]>;
    } =>
        from.reduce<{ explores: string[]; fields: Record<string, string[]> }>(
            (result, model) => {
                const other = to.find(({ name }) => name === model.name);
                if (!other) {
                    return {
                        ...result,
                        explores: [
                            ...result.explores,
                            toExploreName(model.name),
                        ],
                    };
                }
                const kept = new Set(fieldNames(other));
                const gone = fieldNames(model).filter(
                    (name) => !kept.has(name),
                );
                return gone.length === 0
                    ? result
                    : {
                          ...result,
                          fields: {
                              ...result.fields,
                              [toExploreName(model.name)]: gone,
                          },
                      };
            },
            { explores: [], fields: {} },
        );
    const added = missingFrom(next, previous);
    const removed = missingFrom(previous, next);
    return {
        addedExplores: added.explores,
        removedExplores: removed.explores,
        addedFields: added.fields,
        removedFields: removed.fields,
    };
};
