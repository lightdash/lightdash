import {
    assertUnreachable,
    ParameterError,
    TimeoutError,
    UnexpectedServerError,
    type ApiSourcePayload,
    type ApiSourceQueryIssue,
} from '@lightdash/common';
import {
    type ApiConnector,
    type ApiConnectorColumn,
    type ApiConnectorDescription,
    type ApiConnectorResult,
    type ApiConnectorUsage,
} from './ApiConnector';
import { toApiSourceQueryError } from './apiSourceExplore';
import { API_SOURCE_RESPONSE_MAX_BYTES } from './ApiSourceIntegration';
import { readRowsWithinCap } from './apiSourceRows';

/**
 * Every step says the most API calls it can make, so a plan's cost is known
 * before its first call.
 */
type ApiPlanStepBase = {
    id: string;
    maxCalls: number;
};

/** The connector's own query, run as one execution, as every shipped integration does. */
export type ApiReportStep = ApiPlanStepBase & {
    kind: 'report';
    payload: ApiSourcePayload;
    limit: number;
};

/** Reads pages of records, refused when there are more than one query can read. */
export type ApiScanStep = ApiPlanStepBase & {
    kind: 'scan';
    /** The connector's request for one page, in its own language. */
    request: string;
    columns: ApiConnectorColumn[];
    requestedRows: number;
    /** The most rows one query can read. */
    maxRows: number;
    pageSize: number;
};

/**
 * Adds attributes to an earlier step's rows by id, a batch of ids per call.
 * Each call answers its whole batch in one page, at most one row per id.
 * Rows whose id isn't found keep null attributes.
 */
export type ApiLookupStep = ApiPlanStepBase & {
    kind: 'lookup';
    /** The step whose rows get the attributes. */
    from: string;
    /** The column holding the id, in both the earlier rows and the looked-up ones. */
    keyColumn: string;
    request: string;
    batchSize: number;
    /** The attribute columns the lookup adds. */
    columns: ApiConnectorColumn[];
};

export type ApiPlanStep = ApiReportStep | ApiScanStep | ApiLookupStep;

export type ApiQueryPlanBudget = {
    calls: number;
    /** No call starts once the query's responses add up to more bytes than this. */
    bytes: number;
    /** No call starts once the query has run longer than this. */
    ms: number;
};

/**
 * How one live data source query runs, as API calls inside that query. The
 * last step's rows are the result. Nothing is kept past the query: only the
 * result enters the results cache.
 */
export type ApiQueryPlan = {
    steps: [ApiPlanStep, ...ApiPlanStep[]];
    budget: ApiQueryPlanBudget;
};

/**
 * The plan of a single connector execution. Its budget is what the
 * connector already allows one query, so it never refuses or stops a query
 * the transport would let through.
 */
export const toOneStepApiQueryPlan = ({
    payload,
    limit,
    description,
}: {
    payload: ApiSourcePayload;
    limit: number;
    description: ApiConnectorDescription;
}): ApiQueryPlan => {
    const { callsPerQuery } = description.limits;
    return {
        steps: [
            {
                id: 'report',
                kind: 'report',
                payload,
                limit,
                maxCalls: callsPerQuery,
            },
        ],
        budget: {
            calls: callsPerQuery,
            bytes: callsPerQuery * API_SOURCE_RESPONSE_MAX_BYTES,
            ms: Number.MAX_SAFE_INTEGER,
        },
    };
};

const formatCount = (count: number) => count.toLocaleString('en-US');

/** The most calls the plan can make, against what the plan and the connector allow. */
export const getApiQueryPlanBudgetIssue = (
    plan: ApiQueryPlan,
    description: ApiConnectorDescription,
): ApiSourceQueryIssue | null => {
    const maxCalls = plan.steps.reduce((sum, step) => sum + step.maxCalls, 0);
    const allowed = Math.min(
        plan.budget.calls,
        description.limits.callsPerQuery,
    );
    return maxCalls > allowed
        ? {
              code: 'live_source.refused.call_budget',
              fieldId: null,
              message: `This query can need up to ${formatCount(
                  maxCalls,
              )} ${description.label} API calls, more than the ${formatCount(
                  allowed,
              )} one query may make. Narrow it with filters or a shorter time range.`,
          }
        : null;
};

/** Fails before any call when the plan could make more calls than one query may. */
export const assertApiQueryPlanWithinBudget = (
    plan: ApiQueryPlan,
    description: ApiConnectorDescription,
): void => {
    const issue = getApiQueryPlanBudgetIssue(plan, description);
    if (issue) {
        throw toApiSourceQueryError([issue]);
    }
};

const assertWellFormed = (plan: ApiQueryPlan) => {
    const seen = new Set<string>();
    plan.steps.forEach((step) => {
        if (seen.has(step.id)) {
            throw new UnexpectedServerError(
                `Api query plan has two steps named "${step.id}"`,
            );
        }
        if (step.kind === 'lookup' && !seen.has(step.from)) {
            throw new UnexpectedServerError(
                `Api query plan step "${step.id}" reads "${step.from}", which doesn't run before it`,
            );
        }
        seen.add(step.id);
    });
};

const chunk = <T>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
        items.slice(index * size, (index + 1) * size),
    );

/** Ids are strings or numbers; a number matches its string form. */
const toKey = (value: unknown, stepId: string): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
    }
    throw new UnexpectedServerError(
        `Api query plan step "${stepId}" got an id that isn't a string or number`,
    );
};

/**
 * Runs a plan step by step. Any step that fails fails the query, so a result
 * is never built from part of the calls. Budgets are checked before every
 * call the plan makes; the transport's own per-query count stays as the
 * backstop for calls a connector makes inside one execution.
 */
export const runApiQueryPlan = async ({
    plan,
    connector,
    usage,
    now = Date.now,
}: {
    plan: ApiQueryPlan;
    connector: ApiConnector;
    /** What the query has spent so far, as the transport counts it. */
    usage: () => Pick<ApiConnectorUsage, 'responseBytes'>;
    now?: () => number;
}): Promise<ApiConnectorResult> => {
    const description = connector.describe();
    const { label } = description;
    assertWellFormed(plan);
    assertApiQueryPlanWithinBudget(plan, description);

    const startedAt = now();
    const beforeCall = () => {
        const spent = usage();
        if (spent.responseBytes > plan.budget.bytes) {
            throw new ParameterError(
                `This query reads more than ${formatCount(
                    Math.round(plan.budget.bytes / (1024 * 1024)),
                )} MB from ${label}, the most one query may read. Narrow it with filters or a shorter time range.`,
            );
        }
        if (now() - startedAt > plan.budget.ms) {
            throw new TimeoutError(
                `This ${label} query took longer than ${formatCount(
                    Math.round(plan.budget.ms / 1000),
                )} seconds, the most one query may take. Narrow it with filters or a shorter time range.`,
            );
        }
    };
    const fetchRows = (stepId: string) => {
        if (!connector.fetchRows) {
            throw new UnexpectedServerError(
                `${label} can't run api query plan step "${stepId}"`,
            );
        }
        return connector.fetchRows.bind(connector);
    };

    const results = new Map<string, ApiConnectorResult>();
    let last: ApiConnectorResult | undefined;
    // Steps read earlier steps' rows, so they run one after another
    /* eslint-disable no-await-in-loop */
    for (const step of plan.steps) {
        switch (step.kind) {
            case 'report':
                beforeCall();
                last = await connector.execute({
                    payload: step.payload,
                    limit: step.limit,
                });
                break;
            case 'scan': {
                const fetch = fetchRows(step.id);
                const { rows, hasMoreRows } = await readRowsWithinCap({
                    label,
                    requestedRows: step.requestedRows,
                    maxRows: step.maxRows,
                    pageSize: step.pageSize,
                    maxPages: step.maxCalls,
                    fetchPage: ({ limit, cursor }) => {
                        beforeCall();
                        return fetch({ request: step.request, limit, cursor });
                    },
                });
                last = {
                    columns: step.columns,
                    rows,
                    hasMoreRows,
                    bytesRead: null,
                };
                break;
            }
            case 'lookup': {
                const fetch = fetchRows(step.id);
                const source = results.get(step.from);
                if (!source) {
                    throw new UnexpectedServerError(
                        `Api query plan step "${step.from}" has no rows`,
                    );
                }
                const sourceColumns = new Set(
                    source.columns.map(({ name }) => name),
                );
                if (
                    step.columns.some(
                        ({ name }) =>
                            sourceColumns.has(name) || name === step.keyColumn,
                    )
                ) {
                    throw new UnexpectedServerError(
                        `Api query plan step "${step.id}" adds a column "${step.from}" already has`,
                    );
                }
                const keys = [
                    ...new Set(
                        source.rows.flatMap(
                            (row) => toKey(row[step.keyColumn], step.id) ?? [],
                        ),
                    ),
                ];
                const batches = chunk(keys, step.batchSize);
                // Calls were already spent, so this isn't a refusal: it
                // fails like the transport's own per-query count
                if (batches.length > step.maxCalls) {
                    throw new ParameterError(
                        `This query needs more than ${formatCount(
                            step.maxCalls,
                        )} ${label} API calls to look up ${formatCount(
                            keys.length,
                        )} ids. Narrow it with filters or a shorter time range.`,
                    );
                }
                const found = new Map<string, Record<string, unknown>>();
                for (const batch of batches) {
                    beforeCall();
                    const page = await fetch({
                        request: step.request,
                        limit: batch.length,
                        keys: batch,
                    });
                    if (page.nextCursor !== undefined) {
                        throw new UnexpectedServerError(
                            `${label} answered api query plan step "${step.id}" with more than one page`,
                        );
                    }
                    page.rows.forEach((row) => {
                        const key = toKey(row[step.keyColumn], step.id);
                        if (key === null) return;
                        if (found.has(key)) {
                            throw new UnexpectedServerError(
                                `${label} returned two rows for one id in api query plan step "${step.id}"`,
                            );
                        }
                        found.set(key, row);
                    });
                }
                last = {
                    ...source,
                    columns: [...source.columns, ...step.columns],
                    rows: source.rows.map((row) => {
                        const key = toKey(row[step.keyColumn], step.id);
                        const match = key === null ? undefined : found.get(key);
                        return {
                            ...row,
                            ...Object.fromEntries(
                                step.columns.map(({ name }) => [
                                    name,
                                    match?.[name] ?? null,
                                ]),
                            ),
                        };
                    }),
                };
                break;
            }
            default:
                return assertUnreachable(step, 'Unknown api query plan step');
        }
        results.set(step.id, last);
    }
    /* eslint-enable no-await-in-loop */
    if (!last) {
        throw new UnexpectedServerError('Api query plan has no steps');
    }
    // The caller refuses a cut result through the same check as a single call
    return last;
};
