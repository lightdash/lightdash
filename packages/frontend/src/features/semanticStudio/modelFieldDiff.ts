import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type SemanticLayerTouchedField,
} from '@lightdash/common';

export type FieldChange = {
    /** `table.name`, stable across both versions. */
    key: string;
    label: string;
    kind: 'new' | 'changed' | 'removed';
    /** What differs on a changed field, in plain words. */
    attributes: string[];
};

/** Derived from the definition, so they differ whenever it does and say nothing more. */
const DERIVED = new Set([
    'compiledSql',
    'tablesReferences',
    'tablesRequiredAttributes',
    'index',
]);

type FieldLike = { label?: string; name?: string };

const getFields = (explore: Explore | null): Map<string, FieldLike> => {
    const table = explore?.tables[explore.baseTable];
    if (!table) return new Map();
    return new Map(
        [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ].map((field) => [`${table.name}.${field.name}`, field]),
    );
};

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
    after.forEach((field, key) => {
        const label = field.label ?? field.name ?? key;
        const old = before.get(key);
        if (!old) {
            changes.push({ key, label, kind: 'new', attributes: [] });
            return;
        }
        const attributes = [
            ...new Set([...Object.keys(field), ...Object.keys(old)]),
        ]
            .filter(
                (name) =>
                    !DERIVED.has(name) &&
                    JSON.stringify(Reflect.get(field, name)) !==
                        JSON.stringify(Reflect.get(old, name)),
            )
            .map(toWords);
        if (attributes.length > 0) {
            changes.push({ key, label, kind: 'changed', attributes });
        }
    });
    before.forEach((field, key) => {
        if (!after.has(key)) {
            changes.push({
                key,
                label: field.label ?? field.name ?? key,
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
