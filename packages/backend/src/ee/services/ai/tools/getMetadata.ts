import {
    flattenAiHints,
    getEffectiveFieldAiHints,
    getFilterTypeFromItemType,
    getMetadataToolDefinition,
    getParameterOptionValues,
    getReferencedExploreParameterDefinitions,
    isDimension,
    isMetric,
    type CompiledField,
    type Explore,
    type GetMetadataParameter,
    type GetMetadataResult,
    type ParameterDefinitions,
    type ToolGetMetadataArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { truncate } from '../utils/truncation';
import {
    getDefaultTimeDimensionFieldIds,
    summarizeRequiredFilters,
} from './grepFieldsIndex';

const toolDefinition = getMetadataToolDefinition.for('agent');

type Dependencies = {
    availableExplores: Explore[];
    // Project-level parameter definitions (from the project_parameters table).
    // Model-level definitions come from the explores themselves.
    projectParameterDefinitions: ParameterDefinitions;
};

const collapse = (text: string, max = 240): string =>
    truncate(text.replace(/\s+/g, ' ').trim(), max);

// Field descriptions carry critical info (allowed values, units, semantics), so
// they get a generous cap — a tight one silently truncates them and misleads the
// agent. Safe here: this tool only renders the few fields explicitly requested.
const FIELD_DESCRIPTION_MAX = 2000;

// Field-id lists in the explore summary are capped so an unusually wide table
// can't flood the context; the overflow marker tells the agent how to see the
// rest. High enough that typical base tables list in full.
const FIELD_LIST_MAX = 120;

// One comma-separated line of the base table's visible field ids. This listing
// is the agent's ground truth for "does field X exist here" — search tools
// (grep/FTS) are lossy, so the summary must not defer back to them for the
// full list, or a search miss becomes unfalsifiable.
const getVisibleFieldIds = (
    fields: { table: string; name: string; hidden?: boolean }[],
): string[] =>
    fields
        .filter((field) => !field.hidden)
        .map((field) => `${field.table}_${field.name}`);

const renderFieldList = (
    kind: 'dimensions' | 'metrics',
    fields: { table: string; name: string; hidden?: boolean }[],
): string => {
    const ids = getVisibleFieldIds(fields);
    if (ids.length === 0) return `  base ${kind}: none`;
    const shown = ids.slice(0, FIELD_LIST_MAX);
    const overflow =
        ids.length > shown.length
            ? `, +${ids.length - shown.length} more (grepFields lists them)`
            : '';
    return `  base ${kind} (${ids.length}): ${shown.join(', ')}${overflow}`;
};

// Only parameters the explore's compiled SQL actually references can change
// query results, so only those are surfaced.
const getExploreParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
): GetMetadataParameter[] =>
    Object.entries(
        getReferencedExploreParameterDefinitions(
            explore,
            projectParameterDefinitions,
        ),
    ).map(([name, definition]) => ({
        name,
        label: definition.label,
        description: definition.description ?? null,
        type: definition.type ?? 'string',
        default: definition.default ?? null,
        multiple: definition.multiple ?? false,
        allowCustomValues: definition.allow_custom_values ?? false,
        options: getParameterOptionValues(definition),
        optionsFromDimension: definition.options_from_dimension ?? null,
    }));

const renderParameter = (parameter: GetMetadataParameter): string => {
    const parts = [
        `    ${parameter.name}  [${parameter.type}${
            parameter.multiple ? ', multi-value' : ''
        }] ${parameter.label}`,
    ];
    if (parameter.default !== null) {
        parts.push(`default: ${JSON.stringify(parameter.default)}`);
    }
    if (parameter.options) {
        parts.push(`options: ${parameter.options.join(', ')}`);
    }
    if (parameter.optionsFromDimension) {
        parts.push(
            `options from dimension: ${parameter.optionsFromDimension.model}.${parameter.optionsFromDimension.dimension}`,
        );
    }
    if (parameter.allowCustomValues) {
        parts.push('(custom values allowed)');
    }
    const description = parameter.description
        ? ` — ${collapse(parameter.description)}`
        : '';
    return parts.join('  ') + description;
};

const renderExplore = (
    explore: Explore,
    parameters: GetMetadataParameter[],
): string => {
    const baseTable = explore.tables[explore.baseTable];
    const lines = [`Explore: ${explore.name} (${explore.label})`];
    if (baseTable?.description) {
        lines.push(`  description: ${collapse(baseTable.description)}`);
    }
    const hint = flattenAiHints(explore.aiHint);
    if (hint) lines.push(`  hint: ${collapse(hint)}`);
    lines.push(`  base table: ${explore.baseTable}`);
    const joined = explore.joinedTables.map((join) => join.table);
    if (joined.length > 0) {
        lines.push(
            `  joined tables (usable in queries, grep with exploreName="${explore.name}" to list their fields): ${joined.join(
                ', ',
            )}`,
        );
    }
    const required = summarizeRequiredFilters(explore);
    if (required) lines.push(`  ${required}`);
    if (parameters.length > 0) {
        lines.push(
            '  ⚠ parameters — fields marked "requires parameters" return different results depending on these values; an unset parameter resolves to its default:',
            ...parameters.map(renderParameter),
        );
    }
    lines.push(
        renderFieldList(
            'dimensions',
            Object.values(baseTable?.dimensions ?? {}),
        ),
        renderFieldList('metrics', Object.values(baseTable?.metrics ?? {})),
    );
    return lines.join('\n');
};

const findField = (
    explore: Explore,
    fieldId: string,
): { field: CompiledField; isJoined: boolean } | null => {
    for (const table of Object.values(explore.tables ?? {})) {
        const fields: CompiledField[] = [
            ...Object.values(table.dimensions ?? {}),
            ...Object.values(table.metrics ?? {}),
        ];
        for (const field of fields) {
            if (!field.hidden && `${field.table}_${field.name}` === fieldId) {
                return {
                    field,
                    isJoined: field.table !== explore.baseTable,
                };
            }
        }
    }
    return null;
};

const getResolvedDefaultTimeDimension = (
    explore: Explore,
    field: CompiledField,
): ReturnType<typeof getDefaultTimeDimensionFieldIds> => {
    if (!isMetric(field)) return null;
    return getDefaultTimeDimensionFieldIds(field, explore.tables[field.table]);
};

const renderField = (
    explore: Explore,
    fieldId: string,
    found: { field: CompiledField; isJoined: boolean },
): string => {
    const { field, isJoined } = found;
    const exploreId = explore.name;
    const kind = isDimension(field) ? 'dimension' : 'metric';
    const lines = [
        `${exploreId}/${fieldId}  [${kind} ${field.type}]`,
        `  label: ${field.label}`,
        `  filter type: ${getFilterTypeFromItemType(field.type)}`,
    ];
    if (isJoined) {
        lines.push(
            `  from joined table "${field.table}" (usable in queries on ${exploreId})`,
        );
    }
    if (isDimension(field) && field.type === 'string') {
        lines.push(`  case-sensitive filters: ${field.caseSensitive ?? true}`);
    }
    if (field.parameterReferences && field.parameterReferences.length > 0) {
        lines.push(
            `  ⚠ requires parameters: ${field.parameterReferences.join(
                ', ',
            )} — what this field returns depends on their values; an unset parameter resolves to its default. See the explore metadata for the definitions.`,
        );
    }
    const defaultTimeDimension = getResolvedDefaultTimeDimension(
        explore,
        field,
    );
    if (defaultTimeDimension) {
        lines.push(
            `  default_time_dimension: ${defaultTimeDimension.defaultTimeDimension}`,
            `  default_time_dimension_granularity: ${defaultTimeDimension.defaultTimeDimensionGranularity}`,
        );
    }
    if (field.description) {
        lines.push(
            `  description: ${collapse(field.description, FIELD_DESCRIPTION_MAX)}`,
        );
    }
    const hint = flattenAiHints(
        getEffectiveFieldAiHints(field, explore.tables[field.table]),
    );
    if (hint) lines.push(`  hint: ${collapse(hint, FIELD_DESCRIPTION_MAX)}`);
    return lines.join('\n');
};

const buildExploreStructuredResult = (
    explore: Explore,
    parameters: GetMetadataParameter[],
): GetMetadataResult['explores'][number] => {
    const baseTable = explore.tables[explore.baseTable];
    const hint = flattenAiHints(explore.aiHint);
    const dimensionIds = getVisibleFieldIds(
        Object.values(baseTable?.dimensions ?? {}),
    );
    const metricIds = getVisibleFieldIds(
        Object.values(baseTable?.metrics ?? {}),
    );
    return {
        exploreId: explore.name,
        status: 'found',
        label: explore.label,
        description: baseTable?.description
            ? collapse(baseTable.description)
            : null,
        hint: hint ? collapse(hint) : null,
        baseTable: explore.baseTable,
        joinedTables: explore.joinedTables.map((join) => join.table),
        requiredFilters: getExploreRequiredFilters(explore),
        parameters,
        baseDimensions: {
            count: dimensionIds.length,
            fieldIds: dimensionIds.slice(0, FIELD_LIST_MAX),
        },
        baseMetrics: {
            count: metricIds.length,
            fieldIds: metricIds.slice(0, FIELD_LIST_MAX),
        },
    };
};

const buildFieldStructuredResult = (
    explore: Explore,
    fieldId: string,
    found: { field: CompiledField; isJoined: boolean },
): GetMetadataResult['fields'][number] => {
    const { field, isJoined } = found;
    const exploreId = explore.name;
    const hint = flattenAiHints(
        getEffectiveFieldAiHints(field, explore.tables[field.table]),
    );
    const defaultTimeDimension = getResolvedDefaultTimeDimension(
        explore,
        field,
    );
    return {
        exploreId,
        fieldId,
        status: 'found',
        kind: isDimension(field) ? 'dimension' : 'metric',
        fieldType: String(field.type),
        label: field.label,
        filterType: getFilterTypeFromItemType(field.type),
        isFromJoinedTable: isJoined,
        joinedTableName: isJoined ? field.table : null,
        caseSensitiveFilters:
            isDimension(field) && field.type === 'string'
                ? (field.caseSensitive ?? true)
                : null,
        defaultTimeDimension:
            defaultTimeDimension?.defaultTimeDimension ?? null,
        defaultTimeDimensionGranularity:
            defaultTimeDimension?.defaultTimeDimensionGranularity ?? null,
        requiredParameters: field.parameterReferences ?? [],
        description: field.description
            ? collapse(field.description, FIELD_DESCRIPTION_MAX)
            : null,
        hint: hint ? collapse(hint, FIELD_DESCRIPTION_MAX) : null,
    };
};

// A field that misses on the requested explore often exists on another explore
// (grep surfaces fields across the whole catalog, so the agent may pair a real
// fieldId with the wrong explore). Without a redirect the "not found" is a dead
// end and the agent loops grep -> getMetadata -> not found indefinitely.
const REACHABLE_EXPLORES_MAX = 5;

const findExploresContainingField = (
    explores: Explore[],
    fieldId: string,
    excludeExploreId: string,
): string[] =>
    explores
        .filter(
            (explore) =>
                explore.name !== excludeExploreId &&
                findField(explore, fieldId) !== null,
        )
        .map((explore) => explore.name);

const buildFieldNotFoundError = (
    availableExplores: Explore[],
    exploreId: string,
    fieldId: string,
): string => {
    const reachableFrom = findExploresContainingField(
        availableExplores,
        fieldId,
        exploreId,
    );
    if (reachableFrom.length === 0) {
        return `Field "${fieldId}" not found in explore "${exploreId}".`;
    }
    const shown = reachableFrom.slice(0, REACHABLE_EXPLORES_MAX);
    const overflow =
        reachableFrom.length > shown.length
            ? ` (+${reachableFrom.length - shown.length} more)`
            : '';
    return `Field "${fieldId}" not found in explore "${exploreId}" — its table is not joined there. It IS available in: ${shown.join(
        ', ',
    )}${overflow}. Query it from one of those explores instead; it cannot be combined with "${exploreId}" fields in a single query.`;
};

export const executeGetMetadata = (
    { requests }: ToolGetMetadataArgs,
    { availableExplores, projectParameterDefinitions }: Dependencies,
): ExecuteStructuredToolResult<GetMetadataResult> => {
    const byName = new Map(
        availableExplores.map((explore) => [explore.name, explore]),
    );
    const textBlocks: string[] = [];
    const explores: GetMetadataResult['explores'] = [];
    const fields: GetMetadataResult['fields'] = [];

    for (const request of requests) {
        if (request.type === 'explore') {
            for (const exploreId of request.exploreIds) {
                const explore = byName.get(exploreId);
                if (!explore) {
                    const error = `Explore "${exploreId}" not found or not available to this agent.`;
                    textBlocks.push(error);
                    explores.push({
                        exploreId,
                        status: 'not_found',
                        error,
                    });
                } else {
                    const parameters = getExploreParameters(
                        explore,
                        projectParameterDefinitions,
                    );
                    textBlocks.push(renderExplore(explore, parameters));
                    explores.push(
                        buildExploreStructuredResult(explore, parameters),
                    );
                }
            }
        } else {
            for (const { exploreId, fieldId } of request.fields) {
                const explore = byName.get(exploreId);
                if (!explore) {
                    const error = `Explore "${exploreId}" not found, so field "${fieldId}" could not be resolved.`;
                    textBlocks.push(error);
                    fields.push({
                        exploreId,
                        fieldId,
                        status: 'not_found',
                        error,
                    });
                } else {
                    const found = findField(explore, fieldId);
                    if (!found) {
                        const error = buildFieldNotFoundError(
                            availableExplores,
                            exploreId,
                            fieldId,
                        );
                        textBlocks.push(error);
                        fields.push({
                            exploreId,
                            fieldId,
                            status: 'not_found',
                            error,
                        });
                    } else {
                        textBlocks.push(renderField(explore, fieldId, found));
                        fields.push(
                            buildFieldStructuredResult(explore, fieldId, found),
                        );
                    }
                }
            }
        }
    }

    return {
        result: textBlocks.join('\n\n'),
        metadata: { status: 'success' },
        structuredContent: {
            explores,
            fields,
        },
    };
};

/**
 * Rich detail for explores/fields the agent already selected (typically from
 * grepFields). Reads only the cached explores passed in — no DB or warehouse —
 * so it returns the metadata findExplores/findFields used to carry (joined
 * tables, required filters, filter types, case-sensitivity, hints) for exactly
 * the entities the agent asked about, in one batched call.
 */
export const getGetMetadata = (dependencies: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const result = executeGetMetadata(args, dependencies);
                return {
                    result: result.result,
                    metadata: result.metadata,
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error getting metadata'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
