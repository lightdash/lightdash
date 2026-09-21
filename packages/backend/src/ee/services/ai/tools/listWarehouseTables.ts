import { listWarehouseTablesToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import { rankCandidates } from '../decisions/rankCandidates';
import type { ListWarehouseTablesFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { compileMatcher, extractKeywords } from './grepFieldsIndex';

type Dependencies = {
    listWarehouseTables: ListWarehouseTablesFn;
    decisions?: AiDecisionClient;
    userQuestion?: string;
};

const toolDefinition = listWarehouseTablesToolDefinition.for('agent');

export const getListWarehouseTables = ({
    listWarehouseTables,
    decisions,
    userQuestion,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ schema, search, limit }) => {
            try {
                const all = await listWarehouseTables();

                const searchLower = search?.toLowerCase();
                let matches: Array<{
                    database: string;
                    schema: string;
                    table: string;
                }> = [];

                for (const [database, schemas] of Object.entries(all)) {
                    if (!decisions && matches.length >= limit) break;
                    for (const [schemaName, tables] of Object.entries(
                        schemas,
                    )) {
                        if (!decisions && matches.length >= limit) break;
                        const schemaMatchesFilter =
                            !schema || schemaName === schema;
                        if (!schemaMatchesFilter) {
                            // schema filter excludes this group
                        } else {
                            for (const tableName of Object.keys(tables)) {
                                if (!decisions && matches.length >= limit)
                                    break;
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

                if (decisions && matches.length > 1) {
                    const query = userQuestion?.trim() || search?.trim() || '';
                    const matchers = extractKeywords(query).map(compileMatcher);
                    if (query) {
                        const shortlist = matches
                            .map((table, index) => ({
                                table,
                                index,
                                score: matchers.filter((match) =>
                                    match(
                                        `${table.database}.${table.schema}.${table.table}`.toLowerCase(),
                                    ),
                                ).length,
                            }))
                            .sort(
                                (a, b) =>
                                    b.score - a.score || a.index - b.index,
                            )
                            .slice(0, 30)
                            .map(({ table }) => table);
                        const selected = new Set(shortlist);
                        const lexicalFallback = [
                            ...shortlist,
                            ...matches.filter((table) => !selected.has(table)),
                        ];
                        matches = lexicalFallback;
                        const ranked = await rankCandidates({
                            decisions,
                            query,
                            candidates: shortlist,
                            describe: (table) => ({
                                ...table,
                                tableType:
                                    all[table.database][table.schema][
                                        table.table
                                    ].tableType ?? null,
                            }),
                            operation: 'warehouse-table-ranking',
                            relevanceInstructions:
                                'The table is a useful source for the requested entity, measure or grain. It need not answer the entire question alone. Judge qualified names and table type; do not invent columns or join relationships. Names alone may be insufficient.',
                        });
                        if (ranked.ranked) {
                            matches = [
                                ...ranked.candidates,
                                ...lexicalFallback.filter(
                                    (table) => !selected.has(table),
                                ),
                            ];
                        }
                    }
                }
                matches = matches.slice(0, limit);

                if (matches.length === 0) {
                    return {
                        result: `No tables matched. Filters: schema=${
                            schema ?? '(none)'
                        }, search=${search ?? '(none)'}. Try a broader search.`,
                        metadata: { status: 'success' },
                    };
                }

                // Group only adjacent schemas: regrouping all tables by schema
                // would move lower-ranked siblings ahead of more relevant tables.
                const lines: string[] = [`${matches.length} table(s) matched.`];
                let previousSchema: string | undefined;
                for (const m of matches) {
                    const key = `${m.database}.${m.schema}`;
                    if (key !== previousSchema) {
                        lines.push(`\n${key}:`);
                        previousSchema = key;
                    }
                    lines.push(`  - ${key}.${m.table}`);
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
