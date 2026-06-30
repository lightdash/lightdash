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

const flatHint = (hint?: string | string[]): string =>
    Array.isArray(hint) ? hint.join(' ') : (hint ?? '');

const collapse = (text: string, max = 240): string =>
    text.replace(/\s+/g, ' ').trim().slice(0, max);

const renderExplore = (explore: Explore): string => {
    const baseTable = explore.tables[explore.baseTable];
    const dimensionCount = Object.values(baseTable?.dimensions ?? {}).filter(
        (d) => !d.hidden,
    ).length;
    const metricCount = Object.values(baseTable?.metrics ?? {}).filter(
        (m) => !m.hidden,
    ).length;
    const lines = [`Explore: ${explore.name} (${explore.label})`];
    if (baseTable?.description) {
        lines.push(`  description: ${collapse(baseTable.description)}`);
    }
    const hint = flatHint(explore.aiHint);
    if (hint) lines.push(`  hint: ${collapse(hint)}`);
    lines.push(`  base table: ${explore.baseTable}`);
    const joined = explore.joinedTables.map((j) => j.table);
    if (joined.length > 0) {
        lines.push(`  joined tables (usable in queries): ${joined.join(', ')}`);
    }
    const required = summarizeRequiredFilters(explore);
    if (required) lines.push(`  ${required}`);
    lines.push(
        `  fields: ${dimensionCount} dimensions, ${metricCount} metrics (use grepFields to list them)`,
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
            if (`${field.table}_${field.name}` === fieldId) {
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
        lines.push(`  description: ${collapse(field.description)}`);
    }
    const hint = flatHint(field.aiHint);
    if (hint) lines.push(`  hint: ${collapse(hint)}`);
    return lines.join('\n');
};

/**
 * Rich detail for explores/fields the agent already selected (typically from
 * grepFields). Reads only the cached explores passed in — no DB or warehouse —
 * so it returns the metadata findExplores/findFields used to carry (joined
 * tables, required filters, filter types, case-sensitivity, hints) for exactly
 * the entities the agent asked about, in one batched call.
 */
export const getGetMetadata = ({ availableExplores }: Dependencies) => {
    const byName = new Map(availableExplores.map((e) => [e.name, e]));

    return tool({
        ...toolDefinition,
        execute: async ({ requests }) => {
            try {
                const blocks: string[] = [];
                for (const request of requests) {
                    if (request.type === 'explore') {
                        for (const exploreId of request.exploreIds) {
                            const explore = byName.get(exploreId);
                            blocks.push(
                                explore
                                    ? renderExplore(explore)
                                    : `Explore "${exploreId}" not found or not available to this agent.`,
                            );
                        }
                    } else {
                        for (const { exploreId, fieldId } of request.fields) {
                            const explore = byName.get(exploreId);
                            if (!explore) {
                                blocks.push(
                                    `Explore "${exploreId}" not found, so field "${fieldId}" could not be resolved.`,
                                );
                            } else {
                                const found = findField(explore, fieldId);
                                blocks.push(
                                    found
                                        ? renderField(exploreId, fieldId, found)
                                        : `Field "${fieldId}" not found in explore "${exploreId}".`,
                                );
                            }
                        }
                    }
                }
                return {
                    result: blocks.join('\n\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error getting metadata'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
};
