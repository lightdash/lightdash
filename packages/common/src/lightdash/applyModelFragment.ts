import { isEqual } from 'es-toolkit/compat';
import { Document, isCollection, parseDocument } from 'yaml';
import { type DbtModelJoin } from '../types/dbt';
import { ParseError } from '../types/errors';
import { type JoinRelationship } from '../types/explore';
import {
    type LightdashModel,
    type LightdashModelAdditionalDimension,
    type LightdashModelDimension,
    type LightdashModelMetric,
    type LightdashModelWithSource,
} from '../types/lightdashModel';
import { validateModelDocument } from './LightdashModelEditor';

type MetricFragments = Record<string, Partial<LightdashModelMetric>>;

type DimensionFragment = Partial<
    Omit<LightdashModelDimension, 'name' | 'metrics' | 'additional_dimensions'>
> & {
    name: string;
    metrics?: MetricFragments;
    additional_dimensions?: Record<
        string,
        Partial<LightdashModelAdditionalDimension>
    >;
};

/** What to add to, or patch on, one native model. Only `name` is required. */
export type LightdashModelFragment = {
    name: string;
    dimensions?: DimensionFragment[];
    metrics?: MetricFragments;
    joins?: (Partial<DbtModelJoin> & { join: string })[];
} & Partial<
    Omit<LightdashModel, 'name' | 'type' | 'dimensions' | 'metrics' | 'joins'>
>;

export type ModelFragmentChange = {
    path: string;
    action: 'created' | 'added' | 'patched' | 'redefined' | 'removed';
};

export type ModelFragmentRefusalReason =
    | 'access'
    | 'name_taken'
    | 'incomplete'
    | 'invalid_filter'
    | 'not_found';

export type ModelFragmentRefusal = {
    path: string;
    reason: ModelFragmentRefusalReason;
};

export type ApplyModelFragmentResult = {
    contents: string;
    changes: ModelFragmentChange[];
    refusals: ModelFragmentRefusal[];
};

/** Parses and validates one native model document kept as a string. */
export const parseModelDocument = (
    contents: string,
    sourcePath: string,
): LightdashModelWithSource => {
    const doc = parseDocument(contents);
    const model = validateModelDocument(doc, sourcePath);
    return { ...model, sourcePath };
};

type YamlObject = Record<string, unknown>;
type YamlPath = (string | number)[];

const FIELD_PRESENTATION_KEYS = new Set([
    'label',
    'description',
    'ai_hint',
    'format',
    'round',
    'compact',
    'group_label',
    'groups',
    'colors',
    'urls',
    'show_underlying_values',
]);
const NO_KEYS = new Set<string>();

type PartRules = {
    /** Keys that change how a part reads, not what it means. */
    presentation: Set<string>;
    /** Keys merged entry by entry, or that identify the part. */
    skip: Set<string>;
    /** Keys that add to meaning when absent, so setting them redefines nothing. */
    additive: Set<string>;
};

const PART_RULES = {
    model: {
        presentation: new Set([
            'label',
            'description',
            'ai_hint',
            'group_label',
            'groups',
            'group_details',
            'order_fields_by',
            'default_show_underlying_values',
        ]),
        skip: new Set(['name', 'type', 'dimensions', 'metrics', 'joins']),
        additive: new Set(['primary_key', 'default_time_dimension']),
    },
    dimension: {
        presentation: FIELD_PRESENTATION_KEYS,
        skip: new Set(['name', 'metrics', 'additional_dimensions']),
        additive: NO_KEYS,
    },
    field: {
        presentation: FIELD_PRESENTATION_KEYS,
        skip: NO_KEYS,
        additive: NO_KEYS,
    },
    join: {
        presentation: new Set(['label', 'description']),
        skip: NO_KEYS,
        additive: NO_KEYS,
    },
} satisfies Record<string, PartRules>;

// Who can see a model, a field or a row: no merge sets these.
const ACCESS_KEYS = new Set([
    'hidden',
    'required_attributes',
    'any_attributes',
    'tags',
    'sql_filter',
    'sql_where',
]);

const isObject = (value: unknown): value is YamlObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isListOfNamed = (value: unknown, key: string): boolean =>
    value === undefined ||
    (Array.isArray(value) &&
        value.every((item) => isObject(item) && typeof item[key] === 'string'));

const isFragmentBody = (
    value: YamlObject,
): value is Omit<LightdashModelFragment, 'name'> =>
    isListOfNamed(value.dimensions, 'name') &&
    isListOfNamed(value.joins, 'join') &&
    (value.metrics === undefined ||
        (isObject(value.metrics) &&
            Object.values(value.metrics).every(isObject)));

/** Reads the YAML fragment written for one model. */
export const parseModelFragment = (
    name: string,
    yaml: string,
): LightdashModelFragment => {
    const doc = parseDocument(yaml);
    const value: unknown = doc.toJS();
    if (doc.errors.length > 0 || !isObject(value)) {
        throw new ParseError(
            `Invalid YAML for model ${name}: ${doc.errors.map((error) => error.message).join('; ') || 'expected a mapping'}`,
        );
    }
    if (!isFragmentBody(value)) {
        throw new ParseError(
            `Invalid fragment for model ${name}: dimensions must be a list of mappings with a name, joins a list of mappings with a join, and metrics a mapping of mappings`,
        );
    }
    return { ...value, name };
};

const hasAccessKey = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(hasAccessKey);
    if (!isObject(value)) return false;
    return Object.entries(value).some(
        ([key, child]) => ACCESS_KEYS.has(key) || hasAccessKey(child),
    );
};

const FILTER_KEYS = new Set(['filters', 'required_filters', 'default_filters']);

// The compiler silently drops a filter that is not one `field: value` pair.
const isInvalidFilterList = (filters: unknown): boolean =>
    filters !== null &&
    (!Array.isArray(filters) ||
        filters.some(
            (filter) => !isObject(filter) || Object.keys(filter).length !== 1,
        ));

const hasInvalidFilter = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(hasInvalidFilter);
    if (!isObject(value)) return false;
    return Object.entries(value).some(([key, child]) =>
        FILTER_KEYS.has(key)
            ? isInvalidFilterList(child)
            : hasInvalidFilter(child),
    );
};

const namesIn = (definition: YamlObject | undefined): string[] =>
    Object.keys(definition ?? {});

/** Records a measured relationship on joins of a model, keyed by alias or joined model. */
export const setModelJoinRelationships = ({
    contents,
    filename,
    relationships,
}: {
    contents: string;
    filename: string;
    relationships: Map<string, JoinRelationship>;
}): string => {
    const doc = parseDocument(contents);
    (validateModelDocument(doc, filename).joins ?? []).forEach(
        (join, index) => {
            const relationship = relationships.get(join.alias ?? join.join);
            if (relationship) {
                doc.setIn(['joins', index, 'relationship'], relationship);
            }
        },
    );
    return doc.toString();
};

const findPartPath = (model: LightdashModel, path: string): YamlPath | null => {
    const [head, name, nested, nestedName, ...rest] = path.split('.');
    if (!name || rest.length > 0) return null;
    if (head === 'metrics') {
        return nested === undefined && model.metrics?.[name]
            ? ['metrics', name]
            : null;
    }
    if (head === 'joins') {
        const index = (model.joins ?? []).findIndex(
            (join) => (join.alias ?? join.join) === name,
        );
        return nested === undefined && index !== -1 ? ['joins', index] : null;
    }
    if (head !== 'dimensions') return null;
    const index = model.dimensions.findIndex((item) => item.name === name);
    if (index === -1) return null;
    if (nested === undefined) return ['dimensions', index];
    if (nested !== 'metrics' && nested !== 'additional_dimensions') return null;
    return nestedName && model.dimensions[index][nested]?.[nestedName]
        ? ['dimensions', index, nested, nestedName]
        : null;
};

/** Removes fields and joins by the paths changes are reported under, such as dimensions.amount.metrics.revenue. */
export const removeModelParts = ({
    contents,
    filename,
    paths,
}: {
    contents: string;
    filename: string;
    paths: string[];
}): ApplyModelFragmentResult => {
    const doc = parseDocument(contents);
    const changes: ModelFragmentChange[] = [];
    const refusals: ModelFragmentRefusal[] = [];
    paths.forEach((path) => {
        const yamlPath = findPartPath(
            validateModelDocument(doc, filename),
            path,
        );
        if (!yamlPath) {
            refusals.push({ path, reason: 'not_found' });
            return;
        }
        doc.deleteIn(yamlPath);
        const parent = yamlPath.slice(0, -1);
        const siblings: unknown = doc.getIn(parent);
        const isDimensionList =
            parent.length === 1 && parent[0] === 'dimensions';
        if (
            !isDimensionList &&
            isCollection(siblings) &&
            siblings.items.length === 0
        ) {
            doc.deleteIn(parent);
        }
        changes.push({ path, action: 'removed' });
    });
    if (changes.length === 0) return { contents, changes, refusals };
    validateModelDocument(doc, filename);
    return { contents: doc.toString(), changes, refusals };
};

/** Why a definition cannot be written as given, or null when it can. */
const findRefusal = (value: unknown): 'access' | 'invalid_filter' | null => {
    if (hasAccessKey(value)) return 'access';
    return hasInvalidFilter(value) ? 'invalid_filter' : null;
};

/** Merges a fragment into a native model, or creates the model when `contents` is null. A person reviews the result, so it may redefine what exists. */
export const applyModelFragment = ({
    contents,
    filename,
    fragment,
}: {
    contents: string | null;
    filename: string;
    fragment: LightdashModelFragment;
}): ApplyModelFragmentResult => {
    const changes: ModelFragmentChange[] = [];
    const refusals: ModelFragmentRefusal[] = [];

    if (contents === null) {
        const { name, ...body } = fragment;
        const reason =
            findRefusal(fragment) ??
            (fragment.sql_from && fragment.dimensions ? null : 'incomplete');
        if (reason) {
            return {
                contents: '',
                changes,
                refusals: [{ path: name, reason }],
            };
        }
        const created = new Document({ type: 'model', name, ...body });
        validateModelDocument(created, filename);
        return {
            contents: created.toString(),
            changes: [{ path: name, action: 'created' }],
            refusals,
        };
    }

    const doc = parseDocument(contents);
    const model = validateModelDocument(doc, filename);

    const takenNames = new Set(
        [
            ...namesIn(model.metrics),
            ...model.dimensions.flatMap((dimension) => [
                dimension.name,
                ...namesIn(dimension.metrics),
                ...namesIn(dimension.additional_dimensions),
            ]),
        ].map((name) => name.toLowerCase()),
    );

    /** True when a new definition may be added under these names. */
    const claim = (path: string, value: unknown, names: string[]): boolean => {
        const reason =
            findRefusal(value) ??
            (names.some((name) => takenNames.has(name.toLowerCase()))
                ? 'name_taken'
                : null);
        if (reason) {
            refusals.push({ path, reason });
            return false;
        }
        names.forEach((name) => takenNames.add(name.toLowerCase()));
        return true;
    };

    /** Sets each key of `incoming` that differs on something that already exists; null removes the key. */
    const patch = ({
        path,
        yamlPath,
        existing,
        incoming,
        rules,
    }: {
        path: string;
        yamlPath: YamlPath;
        existing: YamlObject;
        incoming: YamlObject;
        rules: PartRules;
    }) => {
        Object.entries(incoming).forEach(([key, value]) => {
            if (rules.skip.has(key) || isEqual(existing[key], value)) return;
            if (value === null && existing[key] === undefined) return;
            const keyPath = path ? `${path}.${key}` : key;
            const reason = findRefusal({ [key]: value });
            if (reason) {
                refusals.push({ path: keyPath, reason });
                return;
            }
            if (value === null) {
                doc.deleteIn([...yamlPath, key]);
                changes.push({ path: keyPath, action: 'removed' });
                return;
            }
            const keepsMeaning =
                rules.presentation.has(key) ||
                (rules.additive.has(key) && existing[key] === undefined);
            doc.setIn([...yamlPath, key], doc.createNode(value));
            changes.push({
                path: keyPath,
                action: keepsMeaning ? 'patched' : 'redefined',
            });
        });
    };

    /** Adds or patches each entry of a named map such as `metrics`. */
    const mergeMap = ({
        path,
        yamlPath,
        existing,
        incoming,
        requiredKeys,
    }: {
        path: string;
        yamlPath: YamlPath;
        existing: YamlObject | undefined;
        incoming: YamlObject | undefined;
        requiredKeys: string[];
    }) => {
        Object.entries(incoming ?? {}).forEach(([name, definition]) => {
            const entryPath = `${path}.${name}`;
            const current = existing?.[name];
            if (
                !isObject(definition) ||
                (!isObject(current) &&
                    requiredKeys.some((key) => definition[key] === undefined))
            ) {
                refusals.push({ path: entryPath, reason: 'incomplete' });
                return;
            }
            if (isObject(current)) {
                patch({
                    path: entryPath,
                    yamlPath: [...yamlPath, name],
                    existing: current,
                    incoming: definition,
                    rules: PART_RULES.field,
                });
                return;
            }
            if (!claim(entryPath, definition, [name])) return;
            doc.setIn([...yamlPath, name], doc.createNode(definition));
            changes.push({ path: entryPath, action: 'added' });
        });
    };

    patch({
        path: '',
        yamlPath: [],
        existing: { ...model },
        incoming: { ...fragment },
        rules: PART_RULES.model,
    });

    (fragment.dimensions ?? []).forEach((dimension) => {
        const path = `dimensions.${dimension.name}`;
        const index = model.dimensions.findIndex(
            (item) => item.name === dimension.name,
        );
        if (index === -1) {
            if (!dimension.type || !dimension.sql) {
                refusals.push({ path, reason: 'incomplete' });
                return;
            }
            const names = [
                dimension.name,
                ...namesIn(dimension.metrics),
                ...namesIn(dimension.additional_dimensions),
            ];
            if (!claim(path, dimension, names)) return;
            doc.addIn(['dimensions'], doc.createNode(dimension));
            changes.push({ path, action: 'added' });
            return;
        }
        const current = model.dimensions[index];
        patch({
            path,
            yamlPath: ['dimensions', index],
            existing: { ...current },
            incoming: { ...dimension },
            rules: PART_RULES.dimension,
        });
        mergeMap({
            path: `${path}.metrics`,
            yamlPath: ['dimensions', index, 'metrics'],
            existing: current.metrics,
            incoming: dimension.metrics,
            requiredKeys: ['type'],
        });
        mergeMap({
            path: `${path}.additional_dimensions`,
            yamlPath: ['dimensions', index, 'additional_dimensions'],
            existing: current.additional_dimensions,
            incoming: dimension.additional_dimensions,
            requiredKeys: ['type', 'sql'],
        });
    });

    mergeMap({
        path: 'metrics',
        yamlPath: ['metrics'],
        existing: model.metrics,
        incoming: fragment.metrics,
        requiredKeys: ['type', 'sql'],
    });

    (fragment.joins ?? []).forEach((join) => {
        const key = join.alias ?? join.join;
        const path = `joins.${key}`;
        const joins = model.joins ?? [];
        const index = joins.findIndex(
            (item) => (item.alias ?? item.join) === key,
        );
        if (index !== -1) {
            patch({
                path,
                yamlPath: ['joins', index],
                existing: { ...joins[index] },
                incoming: { ...join },
                rules: PART_RULES.join,
            });
            // The measured relationship described the old condition.
            if (
                join.sql_on &&
                join.sql_on !== joins[index].sql_on &&
                join.relationship === undefined &&
                joins[index].relationship
            ) {
                doc.deleteIn(['joins', index, 'relationship']);
            }
            return;
        }
        if (!join.sql_on) {
            refusals.push({ path, reason: 'incomplete' });
            return;
        }
        if (!claim(path, join, [])) return;
        if (doc.hasIn(['joins'])) doc.addIn(['joins'], doc.createNode(join));
        else doc.setIn(['joins'], doc.createNode([join]));
        changes.push({ path, action: 'added' });
    });

    if (changes.length === 0) return { contents, changes, refusals };

    validateModelDocument(doc, filename);
    // ponytail: whole-document toString reflows hand-written YAML; use node-range edits for files people format.
    return { contents: doc.toString(), changes, refusals };
};
