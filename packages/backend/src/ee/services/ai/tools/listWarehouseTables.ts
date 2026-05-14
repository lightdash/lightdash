import { toolListWarehouseTablesArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import type { ListWarehouseTablesFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    listWarehouseTables: ListWarehouseTablesFn;
};

export const getListWarehouseTables = ({ listWarehouseTables }: Dependencies) =>
    tool({
        description: toolListWarehouseTablesArgsSchema.description,
        inputSchema: toolListWarehouseTablesArgsSchema,
        execute: async ({ schema, search, limit }) => {
            try {
                const all = await listWarehouseTables();

                const searchLower = search?.toLowerCase();
                const matches: Array<{
                    database: string;
                    schema: string;
                    table: string;
                }> = [];

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
                                    });
                                }
                            }
                        }
                    }
                }

                if (matches.length === 0) {
                    return {
                        result: `No tables matched. Filters: schema=${
                            schema ?? '(none)'
                        }, search=${search ?? '(none)'}. Try a broader search.`,
                        metadata: { status: 'success' },
                    };
                }

                // Group by schema for compact, readable output.
                const grouped = new Map<string, string[]>();
                for (const m of matches) {
                    const key = `${m.database}.${m.schema}`;
                    const existing = grouped.get(key) ?? [];
                    existing.push(m.table);
                    grouped.set(key, existing);
                }

                const lines: string[] = [`${matches.length} table(s) matched.`];
                for (const [key, tables] of grouped.entries()) {
                    lines.push(`\n${key}:`);
                    for (const t of tables) {
                        lines.push(`  - ${key}.${t}`);
                    }
                }

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error listing warehouse tables.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
