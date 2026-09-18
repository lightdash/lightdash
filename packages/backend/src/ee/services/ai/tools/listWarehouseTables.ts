import {
    listWarehouseTablesToolDefinition,
    type ToolListWarehouseTablesStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListWarehouseTablesFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    listWarehouseTables: ListWarehouseTablesFn;
};

type ExecuteResult =
    | ExecuteStructuredToolResult<ToolListWarehouseTablesStructuredContent>
    | ExecuteToolErrorResult;

const toolDefinition = listWarehouseTablesToolDefinition.for('agent');

export const getListWarehouseTables = ({ listWarehouseTables }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ schema, search, limit }): Promise<ExecuteResult> => {
            try {
                const all = await listWarehouseTables();

                const searchLower = search?.toLowerCase();
                const matches: ToolListWarehouseTablesStructuredContent['tables'] =
                    [];

                for (const [database, schemas] of Object.entries(all)) {
                    if (matches.length >= limit) break;
                    for (const [schemaName, tables] of Object.entries(
                        schemas,
                    )) {
                        if (matches.length >= limit) break;
                        const schemaMatchesFilter =
                            !schema || schemaName === schema;
                        if (!schemaMatchesFilter) {
                            // schema filter excludes this group
                        } else {
                            for (const tableName of Object.keys(tables)) {
                                if (matches.length >= limit) break;
                                const matchesSearch =
                                    !searchLower ||
                                    tableName
                                        .toLowerCase()
                                        .includes(searchLower);
                                if (matchesSearch) {
                                    matches.push({
                                        database,
                                        schema: schemaName,
                                        table: tableName,
                                        qualifiedName: `${database}.${schemaName}.${tableName}`,
                                    });
                                }
                            }
                        }
                    }
                }

                const structuredContent: ToolListWarehouseTablesStructuredContent =
                    {
                        matchCount: matches.length,
                        filters: {
                            schema: schema ?? null,
                            search: search ?? null,
                        },
                        tables: matches,
                    };

                if (structuredContent.matchCount === 0) {
                    return {
                        result: `No tables matched. Filters: schema=${
                            schema ?? '(none)'
                        }, search=${search ?? '(none)'}. Try a broader search.`,
                        metadata: { status: 'success' },
                        structuredContent,
                    };
                }

                // Group by schema for compact, readable output.
                const grouped = new Map<string, string[]>();
                for (const m of structuredContent.tables) {
                    const key = `${m.database}.${m.schema}`;
                    const existing = grouped.get(key) ?? [];
                    existing.push(m.table);
                    grouped.set(key, existing);
                }

                const lines: string[] = [
                    `${structuredContent.matchCount} table(s) matched.`,
                ];
                for (const [key, tables] of grouped.entries()) {
                    lines.push(`\n${key}:`);
                    for (const t of tables) {
                        lines.push(`  - ${key}.${t}`);
                    }
                }

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error listing warehouse tables.');
            }
        },
    });
