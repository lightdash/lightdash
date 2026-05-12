import { toolRunSqlArgsSchema, type AnyType } from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import type {
    RunSqlJobFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runSqlJob: RunSqlJobFn;
};

const PREVIEW_ROW_LIMIT = 50;

const SELECT_OR_WITH = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_STATEMENTS =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|MERGE|CALL|EXECUTE)\b/i;

const validateSelectOnly = (sql: string) => {
    if (!SELECT_OR_WITH.test(sql)) {
        throw new Error('Only SELECT or WITH queries are allowed.');
    }
    if (FORBIDDEN_STATEMENTS.test(sql)) {
        throw new Error(
            'SQL contains forbidden statements (INSERT/UPDATE/DELETE/DDL). Only SELECT queries are allowed.',
        );
    }
};

export const getRunSql = ({ updateProgress, runSqlJob }: Dependencies) =>
    tool({
        description: toolRunSqlArgsSchema.description,
        inputSchema: toolRunSqlArgsSchema,
        execute: async ({ sql, limit }) => {
            try {
                validateSelectOnly(sql);

                await updateProgress('Running SQL query...');

                const { rows, columns, rowCount } = await runSqlJob({
                    sql,
                    limit,
                });

                if (rowCount === 0) {
                    return {
                        result: `Query returned 0 rows.${
                            columns.length > 0
                                ? ` Columns: ${columns.join(', ')}`
                                : ''
                        }`,
                        metadata: { status: 'success' },
                    };
                }

                const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT);
                const previewCsv = stringify(
                    previewRows.map((row) =>
                        columns.reduce<Record<string, AnyType>>((acc, col) => {
                            acc[col] = row[col];
                            return acc;
                        }, {}),
                    ),
                    { header: true, columns },
                );

                const truncatedNote =
                    rowCount > PREVIEW_ROW_LIMIT
                        ? `\n(Showing first ${PREVIEW_ROW_LIMIT} of ${rowCount} rows.)`
                        : '';

                return {
                    result: `${rowCount} rows. Columns: ${columns.join(
                        ', ',
                    )}.${truncatedNote}\n${serializeData(previewCsv, 'csv')}`,
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error running SQL query.'),
                    metadata: { status: 'error' },
                };
            }
        },
    });
