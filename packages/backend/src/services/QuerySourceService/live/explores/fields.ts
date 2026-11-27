import {
    DimensionType,
    FilterOperator,
    MetricType,
    ParameterError,
    type LiveSourceExploreChange,
    type LiveSourceField,
    type LiveSourceFieldChange,
    type LiveSourceFieldEditor,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveConfiguredCatalog } from '../types';
import {
    liveConfiguredObjectsSchema,
    liveSourceCatalogSchema,
    type LiveSourceCatalog,
} from './catalogState';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
} from './definition';

/**
 * A field the integration offered at its last scan, beyond the built-in ones.
 * `model` names the explore it belongs to; absent, it is the first explore's.
 */
export type ScannedLiveSourceField = (
    | {
          kind: 'dimension';
          definition: LiveDimensionDefinition;
          isInternal: boolean;
      }
    | {
          kind: 'metric';
          definition: LiveMetricDefinition;
          isInternal: boolean;
      }
) & { model?: string };

export type LiveSourceScan = {
    scannedAt: string;
    fields: ScannedLiveSourceField[];
};

/** What an admin or the agent changed on one field; unset keys keep the default. */
export type LiveSourceFieldEdit = {
    inUse?: boolean;
    label?: string;
    description?: string;
    aiHint?: string;
    group?: string | null;
    lastEdit: LiveSourceFieldEditor | null;
};

/**
 * Edits by field name. The first explore's fields keep their bare name;
 * another scanned explore's are keyed `<model>.<name>`, so stored edits from
 * before several explores were scanned read the same.
 */
export type LiveSourceFieldEdits = Record<string, LiveSourceFieldEdit>;

/** The key of a field's edit; `model` is null for the first explore. */
export const getLiveFieldEditKey = (model: string | null, name: string) =>
    model === null ? name : `${model}.${name}`;

/** One scanned explore's scanned fields and edits, keyed by bare field name. */
export const getLiveModelFieldInputs = ({
    model,
    scannedFields,
    edits,
}: {
    model: string | null;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
}): {
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
} => {
    const prefix = model === null ? null : `${model}.`;
    return {
        scannedFields: scannedFields.filter(
            (field) => (field.model ?? null) === model,
        ),
        edits: Object.fromEntries(
            Object.entries(edits).flatMap(([key, edit]) => {
                if (prefix === null) {
                    return key.includes('.') ? [] : [[key, edit]];
                }
                return key.startsWith(prefix)
                    ? [[key.slice(prefix.length), edit]]
                    : [];
            }),
        ),
    };
};

/** What an admin changed on one explore; unset keys keep the default. */
export type LiveSourceExploreEdit = {
    /** Missing means on, so explores added later start on. */
    inUse?: boolean;
    label?: string;
    description?: string;
    aiHint?: string;
    lastEdit?: LiveSourceFieldEditor | null;
};

/** Explore edits by model name. */
export type LiveSourceExploreEdits = Record<string, LiveSourceExploreEdit>;

/** The edit of one explore, or undefined when it has none. */
export const getLiveExploreEdit = (
    edits: LiveSourceExploreEdits,
    model: string,
): LiveSourceExploreEdit | undefined =>
    Object.hasOwn(edits, model) ? edits[model] : undefined;

/** Whether the explore is built; it is unless an admin switched it off. */
export const isLiveExploreInUse = (
    edits: LiveSourceExploreEdits,
    model: string,
): boolean => getLiveExploreEdit(edits, model)?.inUse !== false;

/** How a source's fields are curated, as stored next to its settings. */
export type LiveSourceFieldState = {
    /** The built-in explores' discovered fields, from the last Refresh. */
    lastScan: LiveSourceScan | null;
    /** The discovered catalog; null before the first Refresh that stored one. */
    catalog: LiveSourceCatalog | null;
    /** The configured catalog's custom objects, by vendor id. */
    objects: LiveConfiguredCatalog['objects'];
    /** Absent until the source's first build under curation. */
    fields: LiveSourceFieldEdits | null;
    explores: LiveSourceExploreEdits;
    aiHint: string | null;
    targetLabel: string | null;
    /** Tags the source's explores carry, for AI agents limited to tags. */
    tags: string[];
};

const fieldDefinitionSchema = z.object({
    name: z.string(),
    apiName: z.string(),
    label: z.string(),
    description: z.string().optional(),
    filterOperators: z.array(z.nativeEnum(FilterOperator)),
    sql: z.string().optional(),
    valueLabels: z.record(z.string(), z.string()).optional(),
});

const scannedFieldSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('dimension'),
        definition: fieldDefinitionSchema.extend({
            type: z.nativeEnum(DimensionType),
        }),
        isInternal: z.boolean(),
        model: z.string().optional(),
    }),
    z.object({
        kind: z.literal('metric'),
        definition: fieldDefinitionSchema.extend({
            type: z.nativeEnum(MetricType),
            format: z.string().optional(),
        }),
        isInternal: z.boolean(),
        model: z.string().optional(),
    }),
]);

const editorSchema = z.object({
    userUuid: z.string(),
    userName: z.string(),
    at: z.string(),
});

const fieldStateSchema = z.object({
    aiHint: z.string().nullish().catch(null),
    targetLabel: z.string().nullish().catch(null),
    tags: z.array(z.string()).nullish().catch(null),
    lastScan: z
        .object({
            scannedAt: z.string(),
            fields: z.array(scannedFieldSchema),
        })
        .nullish(),
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
    catalog: liveSourceCatalogSchema.nullish().catch(null),
    objects: liveConfiguredObjectsSchema.nullish().catch(null),
});

/** Reads the curation keys of a stored `api_source`; unreadable keys read as absent. */
export const parseLiveSourceFieldState = (
    apiSource: unknown,
): LiveSourceFieldState => {
    const parsed = fieldStateSchema.safeParse(apiSource);
    if (!parsed.success) {
        return {
            lastScan: null,
            catalog: null,
            objects: {},
            fields: null,
            explores: {},
            aiHint: null,
            targetLabel: null,
            tags: [],
        };
    }
    return {
        lastScan: parsed.data.lastScan ?? null,
        catalog: parsed.data.catalog ?? null,
        objects: parsed.data.objects ?? {},
        fields: parsed.data.fields ?? null,
        explores: parsed.data.explores ?? {},
        aiHint: parsed.data.aiHint ?? null,
        targetLabel: parsed.data.targetLabel ?? null,
        tags: parsed.data.tags ?? [],
    };
};

type ResolvedField = {
    kind: 'dimension' | 'metric';
    definition: LiveDimensionDefinition | LiveMetricDefinition;
    isBuiltIn: boolean;
    isInternal: boolean;
    edit: LiveSourceFieldEdit | null;
};

const resolveFields = ({
    base,
    scannedFields,
}: {
    base: LiveExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
}) => {
    const builtInNames = new Set([
        ...base.dimensions.map(({ name }) => name),
        ...base.metrics.map(({ name }) => name),
    ]);
    return [
        ...base.dimensions.map((definition) => ({
            kind: 'dimension' as const,
            definition,
            isBuiltIn: true,
            isInternal: false,
        })),
        ...base.metrics.map((definition) => ({
            kind: 'metric' as const,
            definition,
            isBuiltIn: true,
            isInternal: false,
        })),
        ...scannedFields
            .filter(({ definition }) => !builtInNames.has(definition.name))
            .map((field) => ({ ...field, isBuiltIn: false })),
    ];
};

/** The field every query on the explore filters by; it can never be taken out of use. */
export const getRequiredFieldNames = (base: LiveExploreDefinition) =>
    base.dateRange ? [base.dateRange.dimension] : [];

/**
 * Whether a field is built. Unedited, a built-in field is; a discovered one
 * is when its explore shows them by default (a custom object's), unless the
 * vendor marks it internal.
 */
const isFieldInUse = (
    field: Omit<ResolvedField, 'edit'>,
    edit: LiveSourceFieldEdit | undefined,
    required: Set<string>,
    discoveredInUse: boolean,
) =>
    required.has(field.definition.name) ||
    (edit?.inUse ??
        (field.isBuiltIn || (discoveredInUse && !field.isInternal)));

/** Every field of a source with its current state, for the Fields page and the agent. */
export const listLiveSourceFields = ({
    base,
    scannedFields,
    edits,
    usageByFieldName,
    discoveredInUse = false,
}: {
    base: LiveExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
    usageByFieldName: Record<string, number>;
    /** Discovered fields start in use, as a custom object's do. */
    discoveredInUse?: boolean;
}): LiveSourceField[] => {
    const required = new Set(getRequiredFieldNames(base));
    return resolveFields({ base, scannedFields }).map((field) => {
        const edit = Object.hasOwn(edits, field.definition.name)
            ? edits[field.definition.name]
            : undefined;
        return {
            name: field.definition.name,
            apiName: field.definition.apiName,
            kind: field.kind,
            type: field.definition.type,
            label: edit?.label ?? field.definition.label,
            description:
                edit?.description ?? field.definition.description ?? '',
            aiHint: edit?.aiHint ?? field.definition.aiHint ?? null,
            group: edit?.group ?? null,
            isBuiltIn: field.isBuiltIn,
            isInternal: field.isInternal,
            isRequired: required.has(field.definition.name),
            inUse: isFieldInUse(field, edit, required, discoveredInUse),
            usedByChartCount: usageByFieldName[field.definition.name] ?? 0,
            lastEdit: edit?.lastEdit ?? null,
        };
    });
};

/** The explore definition with only the fields in use, edits applied. */
export const applyLiveSourceFieldEdits = ({
    base,
    scannedFields,
    edits,
    discoveredInUse = false,
}: {
    base: LiveExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
    /** Discovered fields start in use, as a custom object's do. */
    discoveredInUse?: boolean;
}): LiveExploreDefinition => {
    const required = new Set(getRequiredFieldNames(base));
    const inUse = resolveFields({ base, scannedFields }).flatMap((field) => {
        const edit = Object.hasOwn(edits, field.definition.name)
            ? edits[field.definition.name]
            : undefined;
        if (!isFieldInUse(field, edit, required, discoveredInUse)) {
            return [];
        }
        return [
            {
                ...field,
                definition: {
                    ...field.definition,
                    label: edit?.label ?? field.definition.label,
                    description:
                        edit?.description ?? field.definition.description,
                    ...(edit?.aiHint ? { aiHint: edit.aiHint } : {}),
                    ...(edit?.group ? { groups: [edit.group] } : {}),
                },
            },
        ];
    });
    return {
        ...base,
        dimensions: inUse.flatMap((field) =>
            field.kind === 'dimension'
                ? [field.definition as LiveDimensionDefinition]
                : [],
        ),
        metrics: inUse.flatMap((field) =>
            field.kind === 'metric'
                ? [field.definition as LiveMetricDefinition]
                : [],
        ),
    };
};

/**
 * The edits a source starts curation with. A source built before curation
 * keeps every scanned field it already had in use, so its charts keep working.
 */
export const getInitialLiveSourceFieldEdits = ({
    scannedFields,
    isExistingSource,
}: {
    scannedFields: ScannedLiveSourceField[];
    isExistingSource: boolean;
}): LiveSourceFieldEdits =>
    isExistingSource
        ? Object.fromEntries(
              scannedFields.map(({ definition, model }) => [
                  getLiveFieldEditKey(model ?? null, definition.name),
                  { inUse: true, lastEdit: null },
              ]),
          )
        : {};

const MAX_FIELD_TEXT_LENGTH = 2000;

/**
 * Applies field changes to the stored edits and stamps each changed field
 * with its editor. Fails on an unknown field, a required field taken out of
 * use, or an empty label.
 */
export const applyLiveSourceFieldChanges = ({
    current,
    changes,
    knownNames,
    requiredNames,
    editor,
}: {
    current: LiveSourceFieldEdits;
    changes: LiveSourceFieldChange[];
    knownNames: Set<string>;
    requiredNames: Set<string>;
    editor: LiveSourceFieldEditor;
}): LiveSourceFieldEdits => {
    const problems = changes.flatMap((change) => {
        if (!knownNames.has(change.name)) {
            return [`"${change.name}" isn't a field of this source.`];
        }
        if (change.inUse === false && requiredNames.has(change.name)) {
            return [
                `"${change.name}" is needed by every query, so it stays in use.`,
            ];
        }
        if (change.label !== undefined && change.label?.trim() === '') {
            return [`"${change.name}" needs a label.`];
        }
        const tooLong = [
            change.label,
            change.description,
            change.aiHint,
            change.group,
        ].some((text) => (text?.length ?? 0) > MAX_FIELD_TEXT_LENGTH);
        return tooLong
            ? [
                  `"${change.name}" has text over ${MAX_FIELD_TEXT_LENGTH} characters.`,
              ]
            : [];
    });
    if (problems.length > 0) {
        throw new ParameterError(problems.join(' '));
    }
    const withText = (
        edit: LiveSourceFieldEdit,
        key: 'label' | 'description' | 'aiHint',
        value: string | null | undefined,
    ): LiveSourceFieldEdit => {
        if (value === undefined) {
            return edit;
        }
        const { [key]: _cleared, ...rest } = edit;
        const text = value?.trim();
        return text ? { ...rest, [key]: text } : rest;
    };
    return changes.reduce<LiveSourceFieldEdits>((edits, change) => {
        const existing: LiveSourceFieldEdit = Object.hasOwn(edits, change.name)
            ? edits[change.name]
            : { lastEdit: null };
        const withTexts = [
            ['label', change.label],
            ['description', change.description],
            ['aiHint', change.aiHint],
        ] as const;
        const next = withTexts.reduce(
            (edit, [key, value]) => withText(edit, key, value),
            existing,
        );
        return {
            ...edits,
            [change.name]: {
                ...next,
                ...(change.inUse !== undefined ? { inUse: change.inUse } : {}),
                ...(change.group !== undefined
                    ? { group: change.group?.trim() || null }
                    : {}),
                lastEdit: editor,
            },
        };
    }, current);
};

/** A change to the explore of `model`, named by its model instead of its explore name. */
export type LiveSourceExploreModelChange = Omit<
    LiveSourceExploreChange,
    'exploreName'
> & { model: string };

/**
 * Applies explore changes to the stored edits and stamps each changed
 * explore with its editor. Switching an explore on drops `inUse`, so the
 * edits only ever store explores that are off. Fails on an empty label or
 * text over the limit.
 */
export const applyLiveSourceExploreChanges = ({
    current,
    changes,
    editor,
}: {
    current: LiveSourceExploreEdits;
    changes: LiveSourceExploreModelChange[];
    editor: LiveSourceFieldEditor;
}): LiveSourceExploreEdits => {
    const problems = changes.flatMap((change) => {
        if (change.label !== undefined && change.label?.trim() === '') {
            return [`Explore "${change.model}" needs a label.`];
        }
        const tooLong = [change.label, change.description, change.aiHint].some(
            (text) => (text?.length ?? 0) > MAX_FIELD_TEXT_LENGTH,
        );
        return tooLong
            ? [
                  `Explore "${change.model}" has text over ${MAX_FIELD_TEXT_LENGTH} characters.`,
              ]
            : [];
    });
    if (problems.length > 0) {
        throw new ParameterError(problems.join(' '));
    }
    return changes.reduce<LiveSourceExploreEdits>((edits, change) => {
        const existing = getLiveExploreEdit(edits, change.model) ?? {};
        const texts = (
            ['label', 'description', 'aiHint'] as const
        ).reduce<LiveSourceExploreEdit>((edit, key) => {
            const value = change[key];
            if (value === undefined) {
                return edit;
            }
            const { [key]: _cleared, ...rest } = edit;
            const text = value?.trim();
            return text ? { ...rest, [key]: text } : rest;
        }, existing);
        const { inUse: _inUse, ...withoutInUse } = texts;
        let next = texts;
        if (change.inUse !== undefined) {
            next = change.inUse
                ? withoutInUse
                : { ...withoutInUse, inUse: false };
        }
        return { ...edits, [change.model]: { ...next, lastEdit: editor } };
    }, current);
};
