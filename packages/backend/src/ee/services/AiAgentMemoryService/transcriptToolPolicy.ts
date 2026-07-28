import { assertUnreachable } from '@lightdash/common';
import { parse } from 'csv-parse';
import { stripMemoryBlocks } from '../ai/utils/memoryBlock';

const DEFAULT_TOOL_RESULT_LIMIT = 1_000;
const SHORT_TOOL_RESULT_LIMIT = 500;
const PROJECT_CONTEXT_RESULT_LIMIT = 4_000;
const RESEARCH_REPORT_RESULT_LIMIT = 2_000;
const SQL_ARG_LIMIT = 4_000;
const SAMPLE_ROW_LIMIT = 3;
const SHAPED_RESULT_LIMIT = 10_000;
const MALFORMED_CSV_MARKER = '[query rows omitted: malformed CSV]';
const UNSHAPED_RESULT_MARKER = '[result omitted: unsupported shape format]';
const OVERSIZED_SHAPE_MARKER = '[shaped result omitted: exceeds safe size]';
const QUERY_WITHOUT_ROWS_MARKER = '[query completed without row data]';
const CSV_BLOCK_PATTERN = /```csv\s*\n([\s\S]*?)\n```/i;

type KeepPolicy = { type: 'keep' };
type TruncatePolicy = { type: 'truncate'; maxChars: number };
type ShapePolicy = { type: 'shape'; includeSamples: boolean };
type StripPolicy = {
    type: 'strip';
    fence: 'ld-memory';
    maxChars: number;
};
type ShapeRowsPolicy = { type: 'shape_rows'; maxChars: number };
type TruncateSqlPolicy = { type: 'truncate_sql'; maxChars: number };
type OmitResultPolicy = { type: 'omit_result'; reason: string };
type OmitCallPolicy = { type: 'omit_call' };

export type DistillToolResultPolicy =
    | KeepPolicy
    | TruncatePolicy
    | ShapePolicy
    | StripPolicy
    | ShapeRowsPolicy
    | OmitResultPolicy
    | OmitCallPolicy;

type TransformingResultPolicy = Exclude<
    DistillToolResultPolicy,
    OmitResultPolicy | OmitCallPolicy
>;

type DistillToolPolicy = {
    result: DistillToolResultPolicy;
    args?: TruncateSqlPolicy;
};

const keep = { type: 'keep' } as const;
const truncate = (maxChars: number) =>
    ({ type: 'truncate', maxChars }) as const;
const shape = (includeSamples = true) =>
    ({ type: 'shape', includeSamples }) as const;
const strip = (fence: StripPolicy['fence'], maxChars: number) =>
    ({ type: 'strip', fence, maxChars }) as const;
const shapeRows = (maxChars: number) =>
    ({ type: 'shape_rows', maxChars }) as const;
const truncateSql = (maxChars: number) =>
    ({ type: 'truncate_sql', maxChars }) as const;
const omitResult = (reason: string) =>
    ({ type: 'omit_result', reason }) as const;
const omitCall = { type: 'omit_call' } as const;

export const DISTILL_TOOL_POLICIES = {
    loadProjectContext: {
        result: strip('ld-memory', PROJECT_CONTEXT_RESULT_LIMIT),
    },
    loadSkill: { result: omitResult('harness instructions') },
    getKnowledgeDocumentContent: {
        result: omitResult('authoritative source document'),
    },
    listKnowledgeDocuments: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    readPinnedThread: { result: omitResult('cross-thread transcript') },
    getProjectInfo: { result: truncate(SHORT_TOOL_RESULT_LIMIT) },
    listProjects: { result: truncate(SHORT_TOOL_RESULT_LIMIT) },
    grepFields: { result: keep },
    discoverFields: { result: keep },
    getMetadata: { result: keep },
    findExplores: { result: keep },
    findFields: { result: keep },
    searchSemanticLayer: { result: keep },
    analyzeFieldImpact: { result: keep },
    listWarehouseTables: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    describeWarehouseTable: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    searchFieldValues: { result: truncate(SHORT_TOOL_RESULT_LIMIT) },
    runMetricQuery: {
        result: shape(),
        args: truncateSql(SQL_ARG_LIMIT),
    },
    runQuery: { result: shape(), args: truncateSql(SQL_ARG_LIMIT) },
    runSavedChart: { result: shape(), args: truncateSql(SQL_ARG_LIMIT) },
    runContentQuery: { result: shape(), args: truncateSql(SQL_ARG_LIMIT) },
    runSql: { result: shape(), args: truncateSql(SQL_ARG_LIMIT) },
    generateVisualization: { result: shapeRows(DEFAULT_TOOL_RESULT_LIMIT) },
    getDashboardCharts: { result: shapeRows(DEFAULT_TOOL_RESULT_LIMIT) },
    generateDashboard: { result: shapeRows(DEFAULT_TOOL_RESULT_LIMIT) },
    findContent: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    listContent: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    editContent: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    createContent: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    createScheduledDelivery: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    resolveUrl: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    readContent: { result: shape(false) },
    exploreRepo: { result: omitResult('volatile repository content') },
    getPullRequestDiff: { result: omitResult('volatile repository diff') },
    editRepo: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    editDbtProject: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    syncDbtProject: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    setupPreviewDeploy: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    closePullRequest: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    discoverRepos: { result: truncate(SHORT_TOOL_RESULT_LIMIT) },
    listWorkstreams: { result: truncate(SHORT_TOOL_RESULT_LIMIT) },
    improveContext: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    editProjectContext: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    updateUserName: { result: keep },
    submitResearchReport: { result: truncate(RESEARCH_REPORT_RESULT_LIMIT) },
    generateHashes: { result: omitCall },
    generateUuids: { result: omitCall },
    submitDiscoverFieldsResult: { result: omitCall },
    findCharts: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    findDashboards: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    generateBarVizConfig: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    generateTableVizConfig: { result: truncate(DEFAULT_TOOL_RESULT_LIMIT) },
    generateTimeSeriesVizConfig: {
        result: truncate(DEFAULT_TOOL_RESULT_LIMIT),
    },
} as const satisfies Record<string, DistillToolPolicy>;

export type DistillToolInput = {
    name: string;
    args: unknown;
    result: string | null;
    resultIsError: boolean;
    source: 'lightdash' | 'mcp';
};

export type DistillToolOutput = {
    name: string;
    args: unknown;
    source?: 'mcp';
    result?: string;
    result_omitted?: string;
};

type TransformOptions = {
    sanitizeText: (value: string) => string;
    sanitizeUnknown: (value: unknown) => unknown;
    onUnknownTool?: (toolName: string) => void;
};

const truncateText = (value: string, maxChars: number): string => {
    if (value.length <= maxChars) return value;

    let retainedChars = maxChars;
    let marker = '';
    while (true) {
        const omittedChars = value.length - retainedChars;
        marker = `\n[… ${omittedChars} chars omitted …]\n`;
        const allowedChars = maxChars - marker.length;
        if (retainedChars <= allowedChars) break;
        retainedChars = allowedChars;
    }

    const headLength = Math.floor(retainedChars * 0.75);
    const tailLength = retainedChars - headLength;
    return `${value.slice(0, headLength)}${marker}${value.slice(-tailLength)}`;
};

const truncateSqlArgs = (value: unknown, maxChars: number): unknown => {
    if (Array.isArray(value))
        return value.map((child) => truncateSqlArgs(child, maxChars));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                key,
                key.toLowerCase() === 'sql' && typeof child === 'string'
                    ? truncateText(child, maxChars)
                    : truncateSqlArgs(child, maxChars),
            ]),
        );
    }
    return value;
};

const parseCsv = (text: string): Promise<string[][]> =>
    new Promise((resolve, reject) => {
        parse(
            text,
            { relax_column_count: true, skip_empty_lines: true },
            (error, records: string[][]) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(records);
            },
        );
    });

const getJsonObject = (value: string): Record<string, unknown> | null => {
    const start = value.indexOf('{');
    if (start === -1) return null;

    try {
        const parsed: unknown = JSON.parse(value.slice(start));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
};

const getDeclaredRowCount = (value: string): number | null => {
    const patterns = [
        /\bShowing first [\d,]+ of ([\d,]+) rows\b/i,
        /\b([\d,]+) rows\. Columns:/i,
        /\bReturned(?: all)? ([\d,]+) rows\b/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(value)?.[1];
        if (match) return Number(match.replaceAll(',', ''));
    }
    return null;
};

const labelAuthorityExcerpts = (value: string): string =>
    value.replace(
        /^(- id: [^\n]*?;)(?: source: context;)?(?= kind: (?:context|definition);)/gm,
        '$1 source: context (authority excerpt);',
    );

const serializeShape = (shapeValue: Record<string, unknown>): string => {
    const serialized = JSON.stringify(shapeValue);
    return serialized.length <= SHAPED_RESULT_LIMIT
        ? serialized
        : OVERSIZED_SHAPE_MARKER;
};

const shapeNonTabularResult = (value: string): string | null => {
    if (/^(?:No results were returned|Query returned 0 rows\.)/i.test(value)) {
        return serializeShape({ columns: [], rowCount: 0, sampleRows: [] });
    }
    if (/^Success(?:\.|$)/i.test(value)) return QUERY_WITHOUT_ROWS_MARKER;
    return null;
};

const shapeResult = async (
    value: string,
    includeSamples: boolean,
): Promise<string | null> => {
    const csv = CSV_BLOCK_PATTERN.exec(value)?.[1];
    if (csv) {
        const records = await parseCsv(csv).catch(() => null);
        if (!records) return MALFORMED_CSV_MARKER;

        const [columns = [], ...rows] = records;
        return serializeShape({
            columns,
            rowCount: getDeclaredRowCount(value) ?? rows.length,
            sampleRows: includeSamples
                ? rows
                      .slice(0, SAMPLE_ROW_LIMIT)
                      .map((cells) =>
                          Object.fromEntries(
                              columns.map((column, index) => [
                                  column,
                                  cells[index] ?? '',
                              ]),
                          ),
                      )
                : [],
        });
    }

    const object = getJsonObject(value);
    if (object) {
        return serializeShape({
            columns: Object.keys(object),
            rowCount: 1,
            sampleRows: includeSamples ? [object] : [],
        });
    }

    return shapeNonTabularResult(value);
};

const shapeRowsInResult = async (value: string): Promise<string> => {
    const csv = CSV_BLOCK_PATTERN.exec(value)?.[1];
    if (!csv) return value;

    const shaped = await shapeResult(`\`\`\`csv\n${csv}\n\`\`\``, true);
    if (!shaped) return value;
    return value.replace(CSV_BLOCK_PATTERN, () =>
        shaped === MALFORMED_CSV_MARKER
            ? MALFORMED_CSV_MARKER
            : `[row shape: ${shaped}]`,
    );
};

const transformResult = async (
    value: string,
    policy: TransformingResultPolicy,
    resultIsError: boolean,
): Promise<string> => {
    switch (policy.type) {
        case 'keep':
            return value;
        case 'truncate':
            return truncateText(value, policy.maxChars);
        case 'shape':
            return resultIsError
                ? value
                : ((await shapeResult(value, policy.includeSamples)) ??
                      UNSHAPED_RESULT_MARKER);
        case 'strip': {
            const withoutMemory = stripMemoryBlocks(value);
            const stripped = labelAuthorityExcerpts(withoutMemory);
            const marker =
                withoutMemory === value
                    ? ''
                    : `[… ${policy.fence} content omitted by policy …]`;
            return truncateText(
                [stripped.trim(), marker].filter(Boolean).join('\n'),
                policy.maxChars,
            );
        }
        case 'shape_rows':
            return truncateText(
                await shapeRowsInResult(value),
                policy.maxChars,
            );
        default:
            return assertUnreachable(policy, 'Unknown distill tool policy');
    }
};

export const transformToolForDistill = async (
    tool: DistillToolInput,
    options: TransformOptions,
): Promise<DistillToolOutput | null> => {
    const isMcp = tool.source === 'mcp';
    const policy: DistillToolPolicy | undefined = isMcp
        ? ({ result: truncate(DEFAULT_TOOL_RESULT_LIMIT) } as const)
        : DISTILL_TOOL_POLICIES[
              tool.name as keyof typeof DISTILL_TOOL_POLICIES
          ];

    if (!policy) {
        options.onUnknownTool?.(tool.name);
    }
    const resultPolicy = policy?.result ?? truncate(DEFAULT_TOOL_RESULT_LIMIT);
    if (resultPolicy.type === 'omit_call') return null;

    const output: DistillToolOutput = {
        name: tool.name,
        args: options.sanitizeUnknown(
            policy?.args
                ? truncateSqlArgs(tool.args, policy.args.maxChars)
                : tool.args,
        ),
        ...(isMcp ? { source: 'mcp' as const } : {}),
    };

    if (resultPolicy.type === 'omit_result') {
        return { ...output, result_omitted: resultPolicy.reason };
    }
    if (tool.result === null || tool.result.length === 0) return output;

    return {
        ...output,
        result: await transformResult(
            options.sanitizeText(tool.result),
            resultPolicy,
            tool.resultIsError,
        ),
    };
};
