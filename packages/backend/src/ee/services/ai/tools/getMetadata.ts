import {
    getFilterTypeFromItemType,
    getMetadataToolDefinition,
    isDimension,
    type CompiledField,
    type Explore,
} from '@lightdash/common';
import { tool } from 'ai';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { summarizeRequiredFilters } from './grepFieldsIndex';

const toolDefinition = getMetadataToolDefinition.for('agent');

type Dependencies = {
    availableExplores: Explore[];
};

type ExecuteGetMetadataResult = {
    result: string;
    metadata: { status: 'success' };
    structuredContent: {
        explores: Array<
            | {
                  exploreId: string;
                  status: 'found';
                  label: string;
                  description: string | null;
                  hint: string | null;
                  baseTable: string;
                  joinedTables: string[];
                  requiredFilters: string | null;
                  baseDimensions: {
                      count: number;
                      fieldIds: string[];
                  };
                  baseMetrics: {
                      count: number;
                      fieldIds: string[];
                  };
              }
            | {
                  exploreId: string;
                  status: 'not_found';
                  error: string;
              }
        >;
        fields: Array<
            | {
                  exploreId: string;
                  fieldId: string;
                  status: 'found';
                  kind: 'dimension' | 'metric';
                  fieldType: string;
                  label: string;
                  filterType: string;
                  isFromJoinedTable: boolean;
                  joinedTableName: string | null;
                  caseSensitiveFilters: boolean | null;
                  description: string | null;
                  hint: string | null;
              }
            | {
                  exploreId: string;
                  fieldId: string;
                  status: 'not_found';
                  error: string;
              }
        >;
    };
};

const flatHint = (hint?: string | string[]): string =>
    Array.isArray(hint) ? hint.join(' ') : (hint ?? '');

const collapse = (text: string, max = 240): string =>
    text.replace(/\s+/g, ' ').trim().slice(0, max);

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

const renderExplore = (explore: Explore): string => {
    const baseTable = explore.tables[explore.baseTable];
    const lines = [`Explore: ${explore.name} (${explore.label})`];
    if (baseTable?.description) {
        lines.push(`  description: ${collapse(baseTable.description)}`);
    }
    const hint = flatHint(explore.aiHint);
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

const renderField = (
    exploreId: string,
    fieldId: string,
    found: { field: CompiledField; isJoined: boolean },
): string => {
    const { field, isJoined } = found;
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
    if (field.description) {
        lines.push(
            `  description: ${collapse(field.description, FIELD_DESCRIPTION_MAX)}`,
        );
    }
    const hint = flatHint(field.aiHint);
    if (hint) lines.push(`  hint: ${collapse(hint, FIELD_DESCRIPTION_MAX)}`);
    return lines.join('\n');
};

const buildExploreStructuredResult = (
    explore: Explore,
): ExecuteGetMetadataResult['structuredContent']['explores'][number] => {
    const baseTable = explore.tables[explore.baseTable];
    const hint = flatHint(explore.aiHint);
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
        requiredFilters: summarizeRequiredFilters(explore),
        baseDimensions: {
            count: getVisibleFieldIds(
                Object.values(baseTable?.dimensions ?? {}),
            ).length,
            fieldIds: getVisibleFieldIds(
                Object.values(baseTable?.dimensions ?? {}),
            ).slice(0, FIELD_LIST_MAX),
        },
        baseMetrics: {
            count: getVisibleFieldIds(Object.values(baseTable?.metrics ?? {}))
                .length,
            fieldIds: getVisibleFieldIds(
                Object.values(baseTable?.metrics ?? {}),
            ).slice(0, FIELD_LIST_MAX),
        },
    };
};

const buildFieldStructuredResult = (
    exploreId: string,
    fieldId: string,
    found: { field: CompiledField; isJoined: boolean },
): ExecuteGetMetadataResult['structuredContent']['fields'][number] => {
    const { field, isJoined } = found;
    const hint = flatHint(field.aiHint);
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
        description: field.description
            ? collapse(field.description, FIELD_DESCRIPTION_MAX)
            : null,
        hint: hint ? collapse(hint, FIELD_DESCRIPTION_MAX) : null,
    };
};

export const executeGetMetadata = (
    {
        requests,
    }: {
        requests: Array<
            | { type: 'explore'; exploreIds: string[] }
            | {
                  type: 'field';
                  fields: Array<{ exploreId: string; fieldId: string }>;
              }
        >;
    },
    { availableExplores }: Dependencies,
): ExecuteGetMetadataResult => {
    const byName = new Map(
        availableExplores.map((explore) => [explore.name, explore]),
    );
    const textBlocks: string[] = [];
    const explores: ExecuteGetMetadataResult['structuredContent']['explores'] =
        [];
    const fields: ExecuteGetMetadataResult['structuredContent']['fields'] = [];

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
                    textBlocks.push(renderExplore(explore));
                    explores.push(buildExploreStructuredResult(explore));
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
                        const error = `Field "${fieldId}" not found in explore "${exploreId}".`;
                        textBlocks.push(error);
                        fields.push({
                            exploreId,
                            fieldId,
                            status: 'not_found',
                            error,
                        });
                    } else {
                        textBlocks.push(renderField(exploreId, fieldId, found));
                        fields.push(
                            buildFieldStructuredResult(
                                exploreId,
                                fieldId,
                                found,
                            ),
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
