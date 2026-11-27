import {
    ParameterError,
    type LiveSourceExploreChange,
    type LiveSourceField,
    type LiveSourceFieldChange,
    type LiveSourceFieldEditor,
} from '@lightdash/common';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
    type NamedLiveExploreDefinition,
} from './definition';

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
 * every other explore's are keyed `<model>.<name>`, so stored edits from
 * before several explores could be curated read the same.
 */
export type LiveSourceFieldEdits = Record<string, LiveSourceFieldEdit>;

/** The key of a field's edit; `model` is null for the first explore. */
export const getLiveFieldEditKey = (model: string | null, name: string) =>
    model === null ? name : `${model}.${name}`;

/** One explore's edits, keyed by bare field name; `model` is null for the first explore. */
export const getLiveModelEdits = (
    edits: LiveSourceFieldEdits,
    model: string | null,
): LiveSourceFieldEdits => {
    const prefix = model === null ? null : `${model}.`;
    return Object.fromEntries(
        Object.entries(edits).flatMap(([key, edit]) => {
            if (prefix === null) {
                return key.includes('.') ? [] : [[key, edit]];
            }
            return key.startsWith(prefix)
                ? [[key.slice(prefix.length), edit]]
                : [];
        }),
    );
};

/** What an admin changed on one explore; unset keys keep the default. */
export type LiveSourceExploreEdit = {
    /** Missing, the explore is on unless its definition says otherwise. */
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

/**
 * Whether the explore is built: as an admin set it, else as its definition
 * starts (on, unless `onByDefault` is false).
 */
export const isLiveExploreInUse = (
    edits: LiveSourceExploreEdits,
    model: string,
    onByDefault: boolean = true,
): boolean => getLiveExploreEdit(edits, model)?.inUse ?? onByDefault;

type LiveFieldDefinition = LiveDimensionDefinition | LiveMetricDefinition;

/** An explore's fields with their kind: declared ones first, then the ones `extend` added. */
const resolveFields = (
    definition: LiveExploreDefinition,
    declaredNames: ReadonlySet<string>,
) => {
    const fields = [
        ...definition.dimensions.map((field) => ({
            kind: 'dimension' as const,
            definition: field as LiveFieldDefinition,
        })),
        ...definition.metrics.map((field) => ({
            kind: 'metric' as const,
            definition: field as LiveFieldDefinition,
        })),
    ].map((field) => ({
        ...field,
        isDeclared: declaredNames.has(field.definition.name),
    }));
    return [
        ...fields.filter(({ isDeclared }) => isDeclared),
        ...fields.filter(({ isDeclared }) => !isDeclared),
    ];
};

/** The field every query on the explore filters by; it can never be taken out of use. */
export const getRequiredFieldNames = (definition: LiveExploreDefinition) =>
    definition.dateRange ? [definition.dateRange.dimension] : [];

/**
 * Whether a field is built: always when every query needs it, else as an
 * admin set it, else as its definition starts.
 */
const isFieldInUse = (
    field: LiveFieldDefinition,
    edit: LiveSourceFieldEdit | undefined,
    required: Set<string>,
) => required.has(field.name) || (edit?.inUse ?? field.onByDefault ?? true);

const getEdit = (edits: LiveSourceFieldEdits, name: string) =>
    Object.hasOwn(edits, name) ? edits[name] : undefined;

/** Every field of one explore with its current state, for the Fields page and the agent. */
export const listLiveSourceFields = ({
    definition,
    declaredNames,
    edits,
    usageByFieldName,
}: {
    definition: LiveExploreDefinition;
    /** The fields the integration's code declares, as opposed to ones a Refresh found. */
    declaredNames: ReadonlySet<string>;
    /** The explore's edits, keyed by bare field name. */
    edits: LiveSourceFieldEdits;
    usageByFieldName: Record<string, number>;
}): LiveSourceField[] => {
    const required = new Set(getRequiredFieldNames(definition));
    return resolveFields(definition, declaredNames).map(
        ({ kind, definition: field, isDeclared }) => {
            const edit = getEdit(edits, field.name);
            return {
                name: field.name,
                apiName: field.apiName,
                kind,
                type: field.type,
                label: edit?.label ?? field.label,
                description: edit?.description ?? field.description ?? '',
                aiHint: edit?.aiHint ?? field.aiHint ?? null,
                group: edit?.group ?? null,
                isBuiltIn: isDeclared,
                isInternal: field.onByDefault === false,
                isRequired: required.has(field.name),
                inUse: isFieldInUse(field, edit, required),
                usedByChartCount: usageByFieldName[field.name] ?? 0,
                lastEdit: edit?.lastEdit ?? null,
            };
        },
    );
};

/** The explore definition with only the fields in use, edits applied. */
export const applyLiveSourceFieldEdits = ({
    definition,
    edits,
}: {
    definition: NamedLiveExploreDefinition;
    /** The explore's edits, keyed by bare field name. */
    edits: LiveSourceFieldEdits;
}): NamedLiveExploreDefinition => {
    const required = new Set(getRequiredFieldNames(definition));
    const curate = <F extends LiveFieldDefinition>(fields: F[]): F[] =>
        fields.flatMap((field) => {
            const edit = getEdit(edits, field.name);
            if (!isFieldInUse(field, edit, required)) {
                return [];
            }
            return [
                {
                    ...field,
                    label: edit?.label ?? field.label,
                    description: edit?.description ?? field.description,
                    ...(edit?.aiHint ? { aiHint: edit.aiHint } : {}),
                    ...(edit?.group ? { groups: [edit.group] } : {}),
                },
            ];
        });
    return {
        ...definition,
        dimensions: curate(definition.dimensions),
        metrics: curate(definition.metrics),
    };
};

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
 * explore with its editor. Fails on an empty label or text over the limit.
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
        const next =
            change.inUse === undefined
                ? texts
                : { ...texts, inUse: change.inUse };
        return { ...edits, [change.model]: { ...next, lastEdit: editor } };
    }, current);
};
