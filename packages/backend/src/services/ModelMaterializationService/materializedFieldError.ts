import {
    type DbtModelLightdashConfig,
    type LightdashModel,
} from '@lightdash/common';

const fieldReference =
    /^(?:\$\{TABLE\}\.[a-z_]\w*|\$\{[a-z_]\w*(?:\.[a-z_]\w*)?\}|\d+)$/i;
const predicate =
    /^(?:\$\{TABLE\}\.[a-z_]\w*|\$\{[a-z_]\w*(?:\.[a-z_]\w*)?\})\s*(?:=|<>|!=|>=?|<=?)\s*(?:-?\d+(?:\.\d+)?|true|false|'(?:[^'\\]|'')*')$/i;

export const getMaterializedFieldError = (
    model: LightdashModel,
): string | null => {
    const explores: DbtModelLightdashConfig['explores'] = model.explores ?? {};
    const dimensions = [
        ...model.dimensions,
        ...model.dimensions.flatMap((dimension) =>
            Object.values(dimension.additional_dimensions ?? {}),
        ),
        ...Object.values(model.additional_dimensions ?? {}),
        ...Object.values(explores).flatMap((explore) =>
            Object.values(explore.additional_dimensions ?? {}),
        ),
    ];
    const metrics = [
        ...Object.values(model.metrics ?? {}),
        ...model.dimensions.flatMap((dimension) =>
            Object.values(dimension.metrics ?? {}),
        ),
    ];
    const filters = [model, ...Object.values(explores)].flatMap((config) => [
        config.sql_filter,
        config.sql_where,
    ]);
    if (
        [...dimensions, ...metrics].some(
            ({ sql }) => sql !== undefined && !fieldReference.test(sql.trim()),
        ) ||
        filters.some(
            (sql) => sql !== undefined && !predicate.test(sql.trim()),
        ) ||
        metrics.some((metric) => metric.distinct_keys !== undefined)
    )
        return `Model ${model.name} uses an unsupported materialized field or filter expression.`;
    return null;
};
