import {
    grepWarehouseColumnsToolDefinition,
    type ToolGrepWarehouseColumnsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListWarehouseColumnsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { compileMatcher } from './grepFieldsIndex';

const MAX_COLUMNS_PER_TABLE = 20;

type Dependencies = {
    listWarehouseColumns: ListWarehouseColumnsFn;
};

const toolDefinition = grepWarehouseColumnsToolDefinition.for('agent');

export const getGrepWarehouseColumns = ({
    listWarehouseColumns,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            pattern,
            schema,
            limit,
        }): Promise<
            | ExecuteStructuredToolResult<ToolGrepWarehouseColumnsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const { tables, unreadTableCount } = await listWarehouseColumns(
                    { schema: schema ?? null },
                );
                const matches = compileMatcher(pattern);
                const matched = tables.flatMap(
                    ({ database, schema: tableSchema, table, columns }) => {
                        const found = columns.filter(({ name, type }) =>
                            matches(`${name} ${type}`.toLowerCase()),
                        );
                        return found.length > 0
                            ? [
                                  {
                                      qualifiedName: `${database}.${tableSchema}.${table}`,
                                      columns: found,
                                  },
                              ]
                            : [];
                    },
                );
                const shown = matched.slice(0, limit);
                const unread =
                    unreadTableCount > 0
                        ? ` ${unreadTableCount} more table(s) were not searched; name a schema to reach them.`
                        : '';
                const structuredContent = {
                    matchCount: matched.length,
                    searchedTableCount: tables.length,
                    unreadTableCount,
                    tables: shown,
                };
                if (matched.length === 0) {
                    return {
                        result: `No column matched "${pattern}" in ${tables.length} table(s)${
                            schema ? ` of schema ${schema}` : ''
                        }.${unread} Try a shorter or different word.`,
                        metadata: { status: 'success' },
                        structuredContent,
                    };
                }
                return {
                    result: [
                        `${matched.length} of ${tables.length} table(s) have a matching column${
                            matched.length > shown.length
                                ? `; showing ${shown.length}`
                                : ''
                        }.${unread}`,
                        ...shown.map(
                            ({ qualifiedName, columns }) =>
                                `${qualifiedName}: ${columns
                                    .slice(0, MAX_COLUMNS_PER_TABLE)
                                    .map(
                                        ({ name, type }) => `${name} (${type})`,
                                    )
                                    .join(', ')}${
                                    columns.length > MAX_COLUMNS_PER_TABLE
                                        ? `, and ${columns.length - MAX_COLUMNS_PER_TABLE} more`
                                        : ''
                                }`,
                        ),
                    ].join('\n'),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error searching warehouse columns.');
            }
        },
    });
