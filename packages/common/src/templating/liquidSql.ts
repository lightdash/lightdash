import { Liquid } from 'liquidjs';

/**
 * Liquid template engine for SQL rendering.
 * Uses default Liquid delimiters ({% %} for tags, {{ }} for output)
 * to support conditional SQL syntax like:
 *   {% if ld.parameters.grain == "day" %} ${snapshot_date} {% endif %}
 *
 * This is consistent with the existing Lightdash parameter syntax
 * (${ld.parameters.x}) — just using Liquid delimiters instead of ${}.
 *
 * This is separate from the URL template engine (template.ts) which
 * uses custom delimiters (${} for output).
 */
const liquidSqlEngine = new Liquid({
    cache: true,
    strictVariables: false, // Allow missing variables to resolve to falsy
    strictFilters: false,
});

// Only activate Liquid rendering when the SQL contains Lightdash parameter
// or query context references inside {% %} tags. A bare {% without
// ld.parameters/lightdash.parameters/ld.query could be unrelated syntax.
const LIGHTDASH_LIQUID_PATTERN =
    /\{%[^%]*(?:ld|lightdash)\.(?:parameters|query)\b/;

type ParameterValue = string | number | string[] | number[];

/**
 * Query-time field introspection for a single field.
 * Used internally to derive the ld.query.fields/filters arrays.
 */
export type FieldIntrospection = {
    inQuery: boolean;
    isFiltered: boolean;
};

/**
 * Nested table → field → introspection map.
 * e.g., { events: { event_id: { inQuery: true, isFiltered: false } } }
 */
export type FieldsContext = Record<string, Record<string, FieldIntrospection>>;

/**
 * Build a Liquid context from a parameter values map.
 * Maps parameter values into a nested `ld.parameters` structure
 * to match Lightdash's existing parameter syntax:
 *   {% if ld.parameters.grain == "day" %} ...
 *
 * For dotted parameter names like "model.grain", the value is also
 * accessible via just the short name ("grain").
 */
export const buildLiquidContext = (
    parameterValuesMap: Record<string, ParameterValue>,
    fieldsContext?: FieldsContext,
): {
    ld: {
        parameters: Record<
            string,
            ParameterValue | Record<string, ParameterValue>
        >;
        query: { fields: string[]; filters: string[] };
    };
    lightdash: {
        parameters: Record<
            string,
            ParameterValue | Record<string, ParameterValue>
        >;
        query: { fields: string[]; filters: string[] };
    };
} => {
    const parameters: Record<
        string,
        ParameterValue | Record<string, ParameterValue>
    > = {};

    for (const [key, value] of Object.entries(parameterValuesMap)) {
        parameters[key] = value;

        // For dotted names like "model.grain":
        // - expose as short name ("grain") for backwards compatibility
        // - expose as nested object ({ model: { grain: value } }) so Liquid
        //   dot access like ld.parameters.model.grain works
        const parts = key.split('.');
        const shortName = parts[parts.length - 1];
        if (shortName !== key) {
            parameters[shortName] = value;

            const [tableName, paramName] = parts;
            const existing = parameters[tableName];
            if (
                existing !== undefined &&
                typeof existing === 'object' &&
                !Array.isArray(existing)
            ) {
                existing[paramName] = value;
            } else {
                parameters[tableName] = { [paramName]: value };
            }
        }
    }

    // Derive flat arrays from fieldsContext for the
    // ld.query.fields/filters "contains" syntax:
    //   {% if ld.query.fields contains "events.event_id" %}
    const queryFields: string[] = [];
    const queryFilters: string[] = [];

    for (const [tableName, tableFields] of Object.entries(
        fieldsContext ?? {},
    )) {
        for (const [fieldName, introspection] of Object.entries(tableFields)) {
            const dottedId = `${tableName}.${fieldName}`;
            if (introspection.inQuery) {
                queryFields.push(dottedId);
            }
            if (introspection.isFiltered) {
                queryFilters.push(dottedId);
            }
        }
    }

    const query = { fields: queryFields, filters: queryFilters };

    return {
        ld: { parameters, query },
        lightdash: { parameters, query },
    };
};

/**
 * Render Liquid template blocks in SQL using parameter values.
 *
 * This function evaluates Liquid if/elsif/else/endif blocks in dimension/metric
 * SQL at query time, when parameter values are known.
 *
 * @param sql - The compiled SQL that may contain Liquid template blocks
 * @param parameterValuesMap - Map of parameter names to their current values
 * @returns The SQL with Liquid blocks evaluated and resolved
 *
 * @example
 * ```ts
 * const sql = `{% if ld.parameters.grain == "day" %} DATE_TRUNC('day', "events".report_date)
 *   {% elsif ld.parameters.grain == "week" %} DATE_TRUNC('week', "events".report_date)
 *   {% else %} "events".report_date
 *   {% endif %}`;
 *
 * renderLiquidSql(sql, { grain: 'day' });
 * // => ' DATE_TRUNC(\'day\', "events".report_date)\n'
 * ```
 */
export const renderLiquidSql = (
    sql: string,
    parameterValuesMap: Record<string, ParameterValue>,
    fieldsContext?: FieldsContext,
): string => {
    // Only process SQL that contains Lightdash parameter or field references in Liquid tags.
    // This avoids accidentally processing unrelated {% %} syntax.
    if (!LIGHTDASH_LIQUID_PATTERN.test(sql)) {
        return sql;
    }

    try {
        const context = buildLiquidContext(parameterValuesMap, fieldsContext);
        return liquidSqlEngine.parseAndRenderSync(sql, context);
    } catch {
        // If Liquid parsing fails (e.g., malformed syntax or unrelated {% in SQL),
        // fall back to the original SQL so we don't break existing queries
        return sql;
    }
};
