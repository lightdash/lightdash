import {
    formatItemValue,
    getItemLabelWithoutTableName,
    isDimension,
    isTimeBasedDimension,
    type ItemsMap,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import type { AiAgentDependencies } from '../types/aiAgent';
import { exactNumber, type ExactNumber } from '../utils/exactNumbers';

export type EvidenceCell = {
    id: string;
    queryKey: string;
    rowIndex: number;
    fieldId: string;
    label: string;
    coordinates: Record<string, string>;
    value: ExactNumber;
    percent: boolean;
};

type EvidenceInput = {
    queryUuid: string | null;
    rows: Record<string, unknown>[];
    rowCount: number;
    fields: ItemsMap;
    maxContextRows: number;
    limit: number | null;
    scope: unknown;
};

type QueryEvidence = {
    key: string;
    queryUuid: string | null;
    scope: unknown;
    complete: boolean;
    rowCount: number;
    cells: EvidenceCell[];
};

export class AnswerEvidence {
    private readonly queries: QueryEvidence[] = [];

    revision = 0;

    record(input: EvidenceInput): void {
        try {
            this.recordResult(input);
        } catch {
            Logger.debug('AI answer evidence unavailable for this query.');
        }
    }

    private recordResult(input: EvidenceInput): void {
        const key = `query_${this.revision + 1}`;
        const rows = input.rows.slice(0, Math.min(100, input.maxContextRows));
        const cells: EvidenceCell[] = [];
        const scope = JSON.stringify(input.scope) ?? '';
        let complete =
            rows.length === input.rowCount &&
            input.limit !== null &&
            input.rowCount < input.limit &&
            scope.length <= 2000;
        rows.forEach((row, rowIndex) => {
            const allEntries = Object.entries(row);
            const entries = allEntries.slice(0, 50);
            if (allEntries.length > entries.length) complete = false;
            const allCoordinates = entries.flatMap(([fieldId, value]) => {
                const field = input.fields[fieldId];
                if (field && !isDimension(field)) return [];
                if (!field && exactNumber(value)) return [];
                const label = field
                    ? getItemLabelWithoutTableName(field)
                    : fieldId;
                if (label.length > 80 || String(value ?? 'null').length > 80)
                    complete = false;
                return [
                    [label.slice(0, 80), String(value ?? 'null').slice(0, 80)],
                ];
            });
            if (allCoordinates.length > 6) complete = false;
            const coordinates = Object.fromEntries(allCoordinates.slice(0, 6));
            entries.forEach(([fieldId, raw]) => {
                const field = input.fields[fieldId];
                if (field && isTimeBasedDimension(field)) return;
                const value = exactNumber(raw);
                if (!value) {
                    if (
                        (field && !isDimension(field)) ||
                        typeof raw === 'number'
                    )
                        complete = false;
                    return;
                }
                cells.push({
                    id: `${key}:${rowIndex}:${fieldId}`,
                    queryKey: key,
                    rowIndex,
                    fieldId,
                    label: (field
                        ? getItemLabelWithoutTableName(field)
                        : fieldId
                    ).slice(0, 120),
                    coordinates,
                    value,
                    percent: field
                        ? formatItemValue(field, raw).includes('%')
                        : false,
                });
            });
        });
        const rowCountValue = exactNumber(input.rowCount);
        if (rowCountValue)
            cells.push({
                id: `${key}:row-count`,
                queryKey: key,
                rowIndex: -1,
                fieldId: '__ld_returned_row_count',
                label: 'Returned row count (not a metric total)',
                coordinates: {},
                value: rowCountValue,
                percent: false,
            });
        this.queries.push({
            key,
            queryUuid: input.queryUuid,
            scope: scope.slice(0, 2000),
            rowCount: input.rowCount,
            complete,
            cells,
        });
        this.revision += 1;
        if (this.queries.length > 6) this.queries.shift();
    }

    snapshot() {
        return [...this.queries];
    }
}

export const withAnswerEvidence = (
    dependencies: AiAgentDependencies,
    evidence: AnswerEvidence | undefined,
    maxContextRows: number,
): AiAgentDependencies => {
    if (!evidence) return dependencies;
    return {
        ...dependencies,
        runAsyncQuery: async (...args) => {
            const result = await dependencies.runAsyncQuery(...args);
            evidence.record({
                ...result,
                rowCount: result.rows.length,
                maxContextRows,
                limit: args[0].limit,
                scope: {
                    query: args[0],
                    additionalMetrics: args[1] ?? [],
                    parameters: args[2] ?? null,
                },
            });
            return result;
        },
        runAsyncMergeQuery: async (...args) => {
            const result = await dependencies.runAsyncMergeQuery(...args);
            evidence.record({
                ...result,
                rowCount: result.rows.length,
                maxContextRows,
                limit: args[0].limit,
                scope: { merge: args[0], parameters: args[1] ?? null },
            });
            return result;
        },
        runSavedChartQuery: async (args) => {
            const result = await dependencies.runSavedChartQuery(args);
            evidence.record({
                ...result,
                queryUuid: result.queryUuid,
                rowCount: result.rows.length,
                maxContextRows,
                limit: result.execution.metricQuery.limit,
                scope: { ...args, execution: result.execution },
            });
            return result;
        },
        runSqlJob: async (args) => {
            const result = await dependencies.runSqlJob(args);
            evidence.record({
                ...result,
                fields: {},
                maxContextRows: 50,
                limit: args.limit,
                scope: args,
            });
            return result;
        },
        runComposerQueries: async (args) => {
            const result = await dependencies.runComposerQueries(args);
            evidence.record({
                ...result.terminal,
                fields: {},
                maxContextRows: 50,
                limit: null,
                scope: {
                    terminalNodeId: args.terminalNodeId,
                    queries: args.queries,
                },
            });
            return result;
        },
    };
};
