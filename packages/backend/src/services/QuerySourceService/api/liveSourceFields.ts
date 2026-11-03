import {
    DimensionType,
    FilterOperator,
    MetricType,
    ParameterError,
    type LiveSourceField,
    type LiveSourceFieldChange,
    type LiveSourceFieldEditor,
} from '@lightdash/common';
import { z } from 'zod';
import {
    type ApiSourceDimensionDefinition,
    type ApiSourceExploreDefinition,
    type ApiSourceMetricDefinition,
} from './apiSourceExplore';

/** A field the integration offered at its last scan, beyond the built-in ones. */
export type ScannedLiveSourceField =
    | {
          kind: 'dimension';
          definition: ApiSourceDimensionDefinition;
          isInternal: boolean;
      }
    | {
          kind: 'metric';
          definition: ApiSourceMetricDefinition;
          isInternal: boolean;
      };

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

export type LiveSourceFieldEdits = Record<string, LiveSourceFieldEdit>;

/** How a source's fields are curated, as stored next to its settings. */
export type LiveSourceFieldState = {
    lastScan: LiveSourceScan | null;
    /** Absent until the source's first build under curation. */
    fields: LiveSourceFieldEdits | null;
};

const fieldDefinitionSchema = z.object({
    name: z.string(),
    apiName: z.string(),
    label: z.string(),
    description: z.string().optional(),
    filterOperators: z.array(z.nativeEnum(FilterOperator)),
    sql: z.string().optional(),
});

const scannedFieldSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('dimension'),
        definition: fieldDefinitionSchema.extend({
            type: z.nativeEnum(DimensionType),
        }),
        isInternal: z.boolean(),
    }),
    z.object({
        kind: z.literal('metric'),
        definition: fieldDefinitionSchema.extend({
            type: z.nativeEnum(MetricType),
            format: z.string().optional(),
        }),
        isInternal: z.boolean(),
    }),
]);

const editorSchema = z.object({
    userUuid: z.string(),
    userName: z.string(),
    at: z.string(),
});

const fieldStateSchema = z.object({
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
});

/** Reads the curation keys of a stored `api_source`; unreadable keys read as absent. */
export const parseLiveSourceFieldState = (
    apiSource: unknown,
): LiveSourceFieldState => {
    const parsed = fieldStateSchema.safeParse(apiSource);
    if (!parsed.success) {
        return { lastScan: null, fields: null };
    }
    return {
        lastScan: parsed.data.lastScan ?? null,
        fields: parsed.data.fields ?? null,
    };
};

type ResolvedField = {
    kind: 'dimension' | 'metric';
    definition: ApiSourceDimensionDefinition | ApiSourceMetricDefinition;
    isBuiltIn: boolean;
    isInternal: boolean;
    edit: LiveSourceFieldEdit | null;
};

const resolveFields = ({
    base,
    scannedFields,
}: {
    base: ApiSourceExploreDefinition;
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
export const getRequiredFieldNames = (base: ApiSourceExploreDefinition) =>
    base.dateRange ? [base.dateRange.dimension] : [];

const isFieldInUse = (
    field: Omit<ResolvedField, 'edit'>,
    edit: LiveSourceFieldEdit | undefined,
    required: Set<string>,
) => required.has(field.definition.name) || (edit?.inUse ?? field.isBuiltIn);

/** Every field of a source with its current state, for the Fields page and the agent. */
export const listLiveSourceFields = ({
    base,
    scannedFields,
    edits,
    usageByFieldName,
}: {
    base: ApiSourceExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
    usageByFieldName: Record<string, number>;
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
            aiHint: edit?.aiHint ?? null,
            group: edit?.group ?? null,
            isBuiltIn: field.isBuiltIn,
            isInternal: field.isInternal,
            isRequired: required.has(field.definition.name),
            inUse: isFieldInUse(field, edit, required),
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
}: {
    base: ApiSourceExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
}): ApiSourceExploreDefinition => {
    const required = new Set(getRequiredFieldNames(base));
    const inUse = resolveFields({ base, scannedFields }).flatMap((field) => {
        const edit = Object.hasOwn(edits, field.definition.name)
            ? edits[field.definition.name]
            : undefined;
        if (!isFieldInUse(field, edit, required)) {
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
                ? [field.definition as ApiSourceDimensionDefinition]
                : [],
        ),
        metrics: inUse.flatMap((field) =>
            field.kind === 'metric'
                ? [field.definition as ApiSourceMetricDefinition]
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
              scannedFields.map(({ definition }) => [
                  definition.name,
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
