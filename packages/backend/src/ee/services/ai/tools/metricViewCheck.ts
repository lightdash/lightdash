import {
    DimensionType,
    getErrorMessage,
    getItemId,
    parseModelDocument,
} from '@lightdash/common';
import { toModelPath } from '../../SemanticStudioService/draftFold';
import type {
    RunAsyncQueryFn,
    RunSqlJobFn,
} from '../types/aiAgentDependencies';

const MAX_MEASURES = 3;
const PERIODS = 3;
const TABLE_PREFIX = '${TABLE}.';

export type MetricViewCheckDependencies = {
    runDraftQuery: RunAsyncQueryFn;
    runSqlJob: RunSqlJobFn;
};

export type MetricViewCheck = {
    /** The comparison as the tool reply shows it. */
    lines: string[];
    mismatched: boolean;
};

const toMonth = (value: unknown): string | null => {
    if (!(value instanceof Date) && typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
};

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
};

const sameNumber = (a: number | null, b: number | null): boolean =>
    a === null || b === null
        ? a === b
        : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/**
 * Runs a model imported from a metric view on the draft and straight from the view,
 * by its first date at month grain over the last full months, and compares them.
 * Null when the model has no date or no measure to compare.
 */
export const checkMetricViewImport = async (
    { runDraftQuery, runSqlJob }: MetricViewCheckDependencies,
    {
        model,
        modelYaml,
        today,
    }: { model: string; modelYaml: string; today: Date },
): Promise<MetricViewCheck | null> => {
    const parsed = parseModelDocument(modelYaml, toModelPath(model));
    const date = parsed.dimensions.find(
        ({ type, sql }) =>
            (type === DimensionType.DATE || type === DimensionType.TIMESTAMP) &&
            sql.startsWith(TABLE_PREFIX),
    );
    const measures = Object.entries(parsed.metrics ?? {})
        .flatMap(([name, { sql }]) =>
            sql?.startsWith('MEASURE(') ? [{ name, sql }] : [],
        )
        .slice(0, MAX_MEASURES);
    if (!date || measures.length === 0) return null;

    const monthId = getItemId({ table: model, name: `${date.name}_month` });
    const metricIds = measures.map(({ name }) =>
        getItemId({ table: model, name }),
    );
    // One more month than shown, in case the latest one is still running.
    const limit = PERIODS + 1;
    const viewSql = [
        `SELECT DATE_TRUNC('MONTH', ${date.sql.slice(TABLE_PREFIX.length)}) AS period,`,
        measures.map(({ sql }, i) => `  ${sql} AS m${i}`).join(',\n'),
        `FROM ${parsed.sql_from}`,
        `GROUP BY 1 ORDER BY 1 DESC LIMIT ${limit}`,
    ].join('\n');

    try {
        const [draft, view] = await Promise.all([
            runDraftQuery({
                exploreName: model,
                dimensions: [monthId],
                metrics: metricIds,
                sorts: [{ fieldId: monthId, descending: true }],
                limit,
                filters: {},
                tableCalculations: [],
                customDimensions: [],
                additionalMetrics: [],
                customMetrics: null,
            }),
            runSqlJob({ sql: viewSql, limit }),
        ]);
        const byMonth = (rows: Record<string, unknown>[], key: string) =>
            new Map(rows.map((row) => [toMonth(row[key]), row]));
        const draftRows = byMonth(draft.rows, monthId);
        const viewRows = byMonth(view.rows, 'period');
        const currentMonth = today.toISOString().slice(0, 7);
        const months = [...new Set([...draftRows.keys(), ...viewRows.keys()])]
            .flatMap((month) => (month === null ? [] : [month]))
            .sort()
            .reverse();
        if (months.length === 0) return null;
        const shown = months
            .filter((month) => month !== currentMonth)
            .slice(0, PERIODS);

        let mismatched = false;
        const rows = shown.map((month) => {
            const cells = measures.map(({ name }, i) => {
                const inDraft = toNumber(draftRows.get(month)?.[metricIds[i]]);
                const inView = toNumber(viewRows.get(month)?.[`m${i}`]);
                const same = sameNumber(inDraft, inView);
                mismatched = mismatched || !same;
                return `${name} ${inDraft ?? 'null'} ${same ? '=' : '≠'} ${inView ?? 'null'}`;
            });
            return `  ${month}: ${cells.join(', ')}`;
        });
        return {
            lines: [
                `  compared: ${date.name} by month, the draft = or ≠ the metric view read with MEASURE():`,
                ...rows,
                ...(months.includes(currentMonth)
                    ? [`  ${currentMonth} is left out: the month is not over.`]
                    : []),
                mismatched
                    ? '  The numbers marked ≠ differ. Show the person this comparison and say plainly which differ; leave the model as it is rather than guessing a fix.'
                    : '  Every number matches the metric view.',
            ],
            mismatched,
        };
    } catch (error) {
        return {
            lines: [
                `  compared: comparing with the metric view failed: ${getErrorMessage(error)}. Tell the person in one sentence.`,
            ],
            mismatched: true,
        };
    }
};
