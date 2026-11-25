import { parse } from 'yaml';
import {
    type WarehouseMetricViewDefinition,
    type WarehouseMetricViewField,
    type WarehouseMetricViewWindow,
} from '../types/warehouse';

type YamlMap = Record<string, unknown>;

const isMap = (value: unknown): value is YamlMap =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const maps = (value: unknown): YamlMap[] =>
    Array.isArray(value) ? value.filter(isMap) : [];

const text = (value: unknown): string | null => {
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : null;
};

const texts = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.flatMap((item) => {
              const itemText = text(item);
              return itemText === null ? [] : [itemText];
          })
        : [];

const getField = (field: YamlMap): WarehouseMetricViewField[] => {
    const expr = text(field.expr);
    if (expr === null) return [];
    return [
        {
            // The warehouse derives a missing name from the expression
            name: text(field.name) ?? expr,
            expr,
            label: text(field.display_name),
            comment: text(field.comment),
            synonyms: texts(field.synonyms),
        },
    ];
};

const getWindow = (window: YamlMap): WarehouseMetricViewWindow[] => {
    const order = text(window.order);
    const range = text(window.range);
    if (order === null || range === null) return [];
    return [
        {
            order,
            range,
            semiAdditive:
                window.semiadditive === 'first' ||
                window.semiadditive === 'last'
                    ? window.semiadditive
                    : null,
            offset: text(window.offset),
        },
    ];
};

const getJoins = (
    joins: unknown,
    parent: string | null,
): WarehouseMetricViewDefinition['joins'] =>
    maps(joins).flatMap((join) => {
        const alias = text(join.name);
        const source = text(join.source);
        if (alias === null || source === null) return [];
        const name = parent === null ? alias : `${parent}.${alias}`;
        return [
            { name, source, on: text(join.on), using: texts(join.using) },
            ...getJoins(join.joins, name),
        ];
    });

/** Reads a metric view's YAML by picking named keys; null when the text is not a metric view definition. */
export const parseMetricViewDefinition = (
    definition: string,
): WarehouseMetricViewDefinition | null => {
    let document: unknown;
    try {
        document = parse(definition);
    } catch {
        return null;
    }
    if (!isMap(document)) return null;
    // `fields` is the current key; `dimensions` is its older synonym
    const dimensions = [
        ...maps(document.fields),
        ...maps(document.dimensions),
    ].flatMap(getField);
    const measures = maps(document.measures).flatMap((measure) =>
        getField(measure).map((field) => ({
            ...field,
            window: maps(measure.window).flatMap(getWindow),
        })),
    );
    if (dimensions.length === 0 && measures.length === 0) return null;
    return {
        source: text(document.source),
        filter: text(document.filter),
        parameterized: maps(document.parameters).length > 0,
        dimensions,
        measures,
        joins: getJoins(document.joins, null),
    };
};
