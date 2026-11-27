import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getLiveModelName,
    MetricType,
    UnexpectedServerError,
    type LiveSourceRefreshSummary,
} from '@lightdash/common';
import { z } from 'zod';
import { getLiveIntegration, isLiveIntegrationRegistered } from '../registry';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
    type NamedLiveExploreDefinition,
} from './definition';
import {
    getLiveExploreEdit,
    getLiveFieldEditKey,
    type LiveSourceExploreEdits,
    type LiveSourceFieldEdit,
    type LiveSourceFieldEdits,
} from './fields';

/**
 * A source's explores, built the same way whether its integration declared
 * them or `discover` found them:
 *
 * - a Refresh stores what the vendor reported (`discovered.found`), not
 *   explores; each build turns those facts into explores with the
 *   integration's code, so a deploy changes every source without a Refresh
 * - a declared explore always comes from the code, with the fields the
 *   facts add after its own
 * - an explore the integration left unnamed is named once from its
 *   `apiName` and keeps that name (`modelNames`), so charts on it survive
 *   its label changing or it going away and coming back
 * - every explore and field is on as an admin set it, else as its
 *   definition's `onByDefault` (on when absent). A Refresh that sees a
 *   default change keeps the state the source had, so `onByDefault` only
 *   counts the first time a source sees an item
 */

/** What a Refresh stored: the vendor's facts, as `discover.read` returned them. */
export type LiveSourceDiscovery = {
    /** ISO timestamp of the Refresh. */
    refreshedAt: string;
    found: unknown;
};

/** The explores of a source last refreshed before facts were stored, read from its scan. */
export type LiveSourceLegacyScan = {
    refreshedAt: string;
    explores: LiveExploreDefinition[];
};

/** How a source's explores and fields are curated, as stored next to its settings. */
export type LiveSourceFieldState = {
    /** Null before the first Refresh of an integration that discovers. */
    discovered: LiveSourceDiscovery | null;
    /** Read only, never written: a source's scan from before facts were stored, until its next Refresh. */
    legacy: LiveSourceLegacyScan | null;
    /** The model name the core gave each explore its integration left unnamed, by `apiName`. */
    modelNames: Record<string, string>;
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
    /** What a Refresh tells it apart by: its `apiName`, else its name. */
    key: string;
    /** The model its field edits are keyed under; null for the first declared explore. */
    editModel: string | null;
    definition: NamedLiveExploreDefinition;
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
        name: z.string().min(1).optional(),
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
    .passthrough()
    .refine(
        ({ name, apiName }) => name !== undefined || apiName !== undefined,
        'needs a name or an apiName',
    );

const exploresSchema = z.array(exploreSchema) as unknown as z.ZodType<
    LiveExploreDefinition[]
>;

/** What a Refresh tells an explore apart by: its `apiName`, else its name. */
export const getLiveExploreKey = (explore: LiveExploreDefinition): string =>
    explore.apiName ?? explore.name ?? '';

/**
 * Whether an id can sit in one path segment of an access rule as it is: no
 * `/`, which would add segments, and no `{` or `}`, which would make the
 * segment match anything.
 */
const isPathSafe = (id: string) => !/[/{}?#\s%]/.test(id);

/**
 * The explores a Refresh stores, checked. An explore whose `apiName` can't
 * be one path segment is left out, so it can never widen the source's
 * access.
 */
export const checkDiscoveredExplores = (
    connector: ApiConnectorType,
    discovered: unknown,
): LiveExploreDefinition[] => {
    const { label } = getLiveIntegration(connector);
    const parsed = exploresSchema.safeParse(discovered);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            `${label} reported its explores in an unexpected shape`,
        );
    }
    const keys = parsed.data.map(getLiveExploreKey);
    if (new Set(keys).size !== keys.length) {
        throw new UnexpectedServerError(`${label} reported one explore twice`);
    }
    return parsed.data.filter(
        ({ apiName }) => apiName === undefined || isPathSafe(apiName),
    );
};

/**
 * The explores a source's stored facts give, or its old scan's; none
 * before its first Refresh. As at Refresh, an `apiName` that can't be one
 * path segment is left out, and so is a second explore under one key.
 */
export const getLiveDiscoveredExplores = (
    connector: ApiConnectorType,
    state: Pick<LiveSourceFieldState, 'discovered'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): LiveExploreDefinition[] => {
    const explores = state.discovered
        ? (getLiveIntegration(connector).model.discover?.explores(
              state.discovered.found,
          ) ?? [])
        : (state.legacy?.explores ?? []);
    const seen = new Set<string>();
    return explores.filter((explore) => {
        const key = getLiveExploreKey(explore);
        const isKept =
            !seen.has(key) &&
            (explore.apiName === undefined || isPathSafe(explore.apiName));
        seen.add(key);
        return isKept;
    });
};

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
    discovered: z
        .object({ refreshedAt: z.string(), found: z.unknown() })
        .nullish()
        .catch(null),
    lastScan: legacyScanSchema.nullish(),
    modelNames: z.record(z.string(), z.string().min(1)).nullish().catch(null),
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
    discovered: null,
    legacy: null,
    modelNames: {},
    fields: {},
    explores: {},
    aiHint: null,
    targetLabel: null,
    tags: [],
};

/**
 * A stored scan read as stored explores. Its fields keep the state they had:
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
    const byModel = new Map<
        string,
        {
            dimensions: LiveDimensionDefinition[];
            metrics: LiveMetricDefinition[];
        }
    >();
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
            refreshedAt: scan.scannedAt,
            explores: [...byModel].map(([name, fields]) => ({
                name,
                label: name,
                description: '',
                maxDimensions: null,
                maxMetrics: null,
                dateRange: null,
                incompatible: [],
                ...fields,
            })),
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
        modelNames: data.modelNames ?? {},
        explores: data.explores ?? {},
        aiHint: data.aiHint ?? null,
        targetLabel: data.targetLabel ?? null,
        tags: data.tags ?? [],
    };
    if (data.discovered) {
        return {
            ...base,
            discovered: {
                refreshedAt: data.discovered.refreshedAt,
                found: data.discovered.found,
            },
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

/** Whether a source has been refreshed: it stored facts, or an old scan. */
export const hasLiveRefresh = (
    state: Pick<LiveSourceFieldState, 'discovered'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): boolean => state.discovered !== null || (state.legacy ?? null) !== null;

/** Model names an unnamed explore can't take: declared, fixed and given ones. */
const getTakenModelNames = (
    connector: ApiConnectorType,
    explores: readonly LiveExploreDefinition[],
    modelNames: Record<string, string>,
): Set<string> => {
    const { model } = getLiveIntegration(connector);
    return new Set([
        ...model.explores.map(({ name }) => name),
        ...explores.flatMap(({ name }) => (name ? [name] : [])),
        ...Object.values(modelNames),
    ]);
};

/** The `apiName` of each explore the core still has to name. */
export const getUnnamedApiNames = (
    explores: readonly LiveExploreDefinition[],
    modelNames: Record<string, string>,
): string[] =>
    explores.flatMap(({ name, apiName }) =>
        name === undefined &&
        apiName !== undefined &&
        !Object.hasOwn(modelNames, apiName)
            ? [apiName]
            : [],
    );

/**
 * Names every explore its integration left unnamed, once: its `apiName` as
 * a slug, numbered past any name taken. `isTaken` says whether an explore of
 * that model name belongs to something else in the project.
 */
export const nameLiveExplores = ({
    connector,
    explores,
    modelNames,
    isTaken = () => false,
}: {
    connector: ApiConnectorType;
    explores: readonly LiveExploreDefinition[];
    modelNames: Record<string, string>;
    isTaken?: (model: string) => boolean;
}): Record<string, string> => {
    const taken = getTakenModelNames(connector, explores, modelNames);
    return getUnnamedApiNames(explores, modelNames).reduce<
        Record<string, string>
    >((named, apiName) => {
        const name = getLiveModelName(
            apiName,
            (candidate) => taken.has(candidate) || isTaken(candidate),
        );
        taken.add(name);
        return { ...named, [apiName]: name };
    }, modelNames);
};

/**
 * Every explore of a source: the declared ones, each with the fields a
 * Refresh found after its own, then each one only the Refresh knows, under
 * the name it was given.
 */
export const getLiveSourceModels = (
    connector: ApiConnectorType,
    state: Pick<LiveSourceFieldState, 'discovered' | 'modelNames'> &
        Partial<Pick<LiveSourceFieldState, 'legacy'>>,
): LiveSourceModel[] => {
    const declared = getLiveIntegration(connector).model.explores;
    const discovered = getLiveDiscoveredExplores(connector, state);
    const declaredNames = new Set(declared.map(({ name }) => name));
    const fromCode = declared.map((definition, index): LiveSourceModel => {
        const fieldNames = new Set(
            [...definition.dimensions, ...definition.metrics].map(
                ({ name }) => name,
            ),
        );
        const found = discovered.find(({ name }) => name === definition.name);
        const isNew = ({ name }: { name: string }) => !fieldNames.has(name);
        return {
            name: definition.name,
            key: definition.apiName ?? definition.name,
            editModel: index === 0 ? null : definition.name,
            definition: {
                ...definition,
                dimensions: [
                    ...definition.dimensions,
                    ...(found?.dimensions.filter(isNew) ?? []),
                ],
                metrics: [
                    ...definition.metrics,
                    ...(found?.metrics.filter(isNew) ?? []),
                ],
            },
            isDeclared: true,
            declaredNames: fieldNames,
            onByDefault: definition.onByDefault ?? true,
        };
    });
    const fromRefresh = discovered.flatMap((definition): LiveSourceModel[] => {
        if (definition.name !== undefined && declaredNames.has(definition.name))
            return [];
        const key = getLiveExploreKey(definition);
        const name =
            definition.name ??
            (Object.hasOwn(state.modelNames, key)
                ? state.modelNames[key]
                : undefined);
        if (name === undefined) return [];
        return [
            {
                name,
                key,
                editModel: name,
                definition: { ...definition, name },
                isDeclared: false,
                declaredNames: new Set(),
                onByDefault: definition.onByDefault ?? true,
            },
        ];
    });
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

/** What a Refresh changed: explores by key, and fields by explore. */
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
                const other = to.find(({ key }) => key === model.key);
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
