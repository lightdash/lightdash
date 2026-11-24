import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type SemanticLayerTouchedField,
} from '@lightdash/common';
import { isEqual, omit } from 'es-toolkit/compat';

export type FieldChange = {
    /** `table.name`, stable across both versions. */
    key: string;
    label: string;
    kind: 'new' | 'changed' | 'removed';
    /** What differs on a changed field, in plain words. */
    attributes: string[];
} & ModelField;

/** The field as the person's version has it; the live one for a removed field. */
type ModelField = { table: string; name: string } & (
    | { isMetric: true; field: CompiledMetric }
    | { isMetric: false; field: CompiledDimension }
);

/** Derived from the definition, so they differ whenever it does and say nothing more. */
const DERIVED = new Set([
    'compiledSql',
    'tablesReferences',
    'tablesRequiredAttributes',
    'index',
]);

const getFields = (explore: Explore | null): Map<string, ModelField> => {
    const table = explore?.tables[explore.baseTable];
    if (!table) return new Map();
    return new Map(
        [
            ...Object.values(table.dimensions).map(
                (field): ModelField => ({
                    table: table.name,
                    name: field.name,
                    isMetric: false,
                    field,
                }),
            ),
            ...Object.values(table.metrics).map(
                (field): ModelField => ({
                    table: table.name,
                    name: field.name,
                    isMetric: true,
                    field,
                }),
            ),
        ].map((entry) => [`${table.name}.${entry.name}`, entry]),
    );
};

// Each compile gives a metric's filters new ids, so they are compared without them.
const comparable = (name: string, value: unknown): unknown =>
    name === 'filters' && Array.isArray(value)
        ? value.map((filter: object) => omit(filter, 'id'))
        : value;

/** The attributes a person defined that differ between two versions of a field. */
export const changedAttributes = (before: object, after: object): string[] =>
    [...new Set([...Object.keys(after), ...Object.keys(before)])].filter(
        (name) =>
            !DERIVED.has(name) &&
            !isEqual(
                comparable(name, Reflect.get(after, name)),
                comparable(name, Reflect.get(before, name)),
            ),
    );

const toWords = (key: string): string =>
    key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** What a person's version of a model changes on its own fields, against the live one. */
export const diffModelFields = (
    live: Explore | null,
    mine: Explore | null,
): FieldChange[] => {
    const before = getFields(live);
    const after = getFields(mine);
    const changes: FieldChange[] = [];
    after.forEach((entry, key) => {
        const { field } = entry;
        const label = field.label ?? field.name ?? key;
        const old = before.get(key)?.field;
        if (!old) {
            changes.push({ key, ...entry, label, kind: 'new', attributes: [] });
            return;
        }
        const attributes = changedAttributes(old, field).map(toWords);
        if (attributes.length > 0) {
            changes.push({ key, ...entry, label, kind: 'changed', attributes });
        }
    });
    before.forEach((entry, key) => {
        if (!after.has(key)) {
            changes.push({
                key,
                ...entry,
                label: entry.field.label ?? entry.field.name ?? key,
                kind: 'removed',
                attributes: [],
            });
        }
    });
    return changes;
};

/** Fields saved content may read that a version redefines or removes: the same SQL under a new label moves no number. */
export const findTouchedFields = (
    live: Explore | null,
    mine: Explore | null,
): SemanticLayerTouchedField[] => {
    const fieldsOf = (explore: Explore | null) => {
        const table = explore?.tables[explore.baseTable];
        const fields: (CompiledDimension | CompiledMetric)[] = table
            ? [
                  ...Object.values(table.dimensions),
                  ...Object.values(table.metrics),
              ]
            : [];
        return new Map(fields.map((field) => [getItemId(field), field]));
    };
    const after = fieldsOf(mine);
    return [...fieldsOf(live)].flatMap(([fieldId, field]) => {
        const next = after.get(fieldId);
        if (next && next.compiledSql === field.compiledSql) return [];
        return [
            {
                model: live?.name ?? field.table,
                fieldId,
                label: field.label,
                kind: next ? ('changed' as const) : ('removed' as const),
            },
        ];
    });
};
