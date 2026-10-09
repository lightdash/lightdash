import type bigquery from '@google-cloud/bigquery/build/src/types';
import {
    type AgentAccessDataset,
    type AgentAccessReport,
    type AgentTableStatus,
} from '@lightdash/common';
import { BigqueryWarehouseClient } from '../warehouseClients/BigqueryWarehouseClient';

export type AgentAccessInventoryTable = AgentAccessDataset & {
    name: string;
    location: string;
};

type FailureReason = NonNullable<AgentAccessReport['failureReason']>;

export class AgentAccessProbeError extends Error {
    constructor(public readonly reason: FailureReason) {
        super(reason);
        this.name = 'AgentAccessProbeError';
    }
}

const record = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};

export const classifyBigqueryAccessError = (
    error: unknown,
    phase: 'identity' | 'tables' = 'tables',
):
    | { kind: 'fatal'; reason: FailureReason }
    | Exclude<
          AgentTableStatus,
          { kind: 'readable' } | { kind: 'not_checked' }
      > => {
    if (error instanceof AgentAccessProbeError)
        return { kind: 'fatal', reason: error.reason };
    const root = record(error);
    const response = record(root.response);
    const data = record(response.data);
    const detail = record(data.error);
    const errors = root.errors ?? detail.errors;
    const entries = Array.isArray(errors) ? errors.map(record) : [];
    const reasons = entries.map((entry) => entry.reason);
    const code = detail.code ?? response.status ?? root.code;
    const message = [
        root.message,
        detail.message,
        ...entries.map((entry) => entry.message),
    ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    if (
        code === 401 ||
        reasons.some((reason) =>
            ['authError', 'invalidCredentials', 'invalid_grant'].includes(
                String(reason),
            ),
        ) ||
        data.error === 'invalid_grant'
    )
        return { kind: 'fatal', reason: 'invalid_credentials' };
    if (
        reasons.some((reason) =>
            [
                'rateLimitExceeded',
                'jobRateLimitExceeded',
                'quotaExceeded',
                'resourcesExceeded',
            ].includes(String(reason)),
        ) ||
        code === 429
    )
        return { kind: 'error', reason: 'quota' };
    if (message.includes('bigquery.jobs.create'))
        return { kind: 'fatal', reason: 'job_permission_denied' };
    if (reasons.includes('accessDenied'))
        return { kind: 'blocked', reason: 'access_denied' };
    if (reasons.includes('notFound') || code === 404)
        return { kind: 'error', reason: 'not_found' };
    if (
        ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ABORT_ERR'].includes(String(code)) ||
        root.name === 'AbortError' ||
        root.name === 'TimeoutError'
    )
        return { kind: 'error', reason: 'timeout' };
    if (
        reasons.some((reason) =>
            ['invalidQuery', 'invalid', 'notImplemented'].includes(
                String(reason),
            ),
        )
    )
        return { kind: 'error', reason: 'unsupported' };
    if (
        (typeof code === 'number' && code >= 500) ||
        ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(
            String(code),
        ) ||
        reasons.includes('backendError')
    )
        return { kind: 'error', reason: 'unavailable' };
    if (code === 403) return { kind: 'fatal', reason: 'warehouse_denied' };
    if (
        phase === 'identity' &&
        root.response == null &&
        typeof code !== 'number' &&
        entries.length === 0
    )
        return { kind: 'fatal', reason: 'invalid_credentials' };
    return { kind: 'error', reason: 'unknown' };
};

const quoteTable = (table: AgentAccessInventoryTable) =>
    `\`${[table.database, table.schema, table.name].map((part) => part.replaceAll('\\', '\\\\').replaceAll('`', '\\`')).join('.')}\``;

export class BigqueryAgentAccessProbe {
    constructor(private readonly warehouse: BigqueryWarehouseClient) {}

    private async request<T>(
        path: string,
        method: 'GET' | 'POST',
        data: object | null,
        deadline: number,
    ): Promise<T> {
        const timeout = Math.min(5000, deadline - Date.now());
        if (timeout <= 0) throw new AgentAccessProbeError('timeout');
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                this.warehouse.client.authClient
                    .request<T>({
                        url: `${this.warehouse.client.baseUrl}/${path}`,
                        method,
                        ...(data === null ? {} : { data }),
                        timeout,
                        retry: false,
                        signal: controller.signal,
                    })
                    .then((response) => response.data),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(new AgentAccessProbeError('timeout'));
                    }, timeout);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async principal(deadline: number): Promise<string> {
        const project =
            this.warehouse.credentials.executionProject ||
            this.warehouse.credentials.project;
        const response = await this.request<bigquery.IQueryResponse>(
            `projects/${encodeURIComponent(project)}/queries`,
            'POST',
            {
                query: 'SELECT SESSION_USER() AS principal',
                useLegacySql: false,
                useQueryCache: false,
                labels: { agent: 'true' },
                location: this.warehouse.credentials.location || undefined,
                timeoutMs: 4000,
                jobTimeoutMs: '5000',
            },
            deadline,
        );
        if (response.errors?.length)
            throw Object.assign(
                new Error('The warehouse rejected the identity check.'),
                { errors: response.errors },
            );
        if (!response.jobComplete) throw new AgentAccessProbeError('timeout');
        const principal: unknown = response.rows?.[0]?.f?.[0]?.v;
        if (typeof principal !== 'string' || principal.length === 0)
            throw new AgentAccessProbeError('unknown');
        return principal;
    }

    async listTables(
        dataset: AgentAccessDataset,
        deadline: number,
    ): Promise<AgentAccessInventoryTable[]> {
        const path = `projects/${encodeURIComponent(dataset.database)}/datasets/${encodeURIComponent(dataset.schema)}`;
        const metadata = await this.request<bigquery.IDataset>(
            path,
            'GET',
            null,
            deadline,
        );
        const { location } = metadata;
        if (!location) throw new AgentAccessProbeError('baseline_failed');
        const tables: AgentAccessInventoryTable[] = [];
        const listPage = async (pageToken: string | null): Promise<void> => {
            const query = new URLSearchParams({ maxResults: '1000' });
            if (pageToken !== null) query.set('pageToken', pageToken);
            const page = await this.request<bigquery.ITableList>(
                `${path}/tables?${query}`,
                'GET',
                null,
                deadline,
            );
            for (const table of page.tables ?? []) {
                if (!table.tableReference?.tableId)
                    throw new AgentAccessProbeError('baseline_failed');
                tables.push({
                    ...dataset,
                    name: table.tableReference.tableId,
                    location,
                });
            }
            if (page.nextPageToken) await listPage(page.nextPageToken);
        };
        await listPage(null);
        return tables;
    }

    async probe(
        table: AgentAccessInventoryTable,
        deadline: number,
    ): Promise<AgentTableStatus> {
        try {
            const project =
                this.warehouse.credentials.executionProject ||
                this.warehouse.credentials.project;
            const result = await this.request<bigquery.IJob>(
                `projects/${encodeURIComponent(project)}/jobs`,
                'POST',
                {
                    jobReference: {
                        projectId: project,
                        location: table.location,
                    },
                    configuration: {
                        dryRun: true,
                        labels: { agent: 'true' },
                        jobTimeoutMs: '5000',
                        query: {
                            query: `SELECT * FROM ${quoteTable(table)}`,
                            useLegacySql: false,
                            useQueryCache: false,
                        },
                    },
                },
                deadline,
            );
            if (result.status?.errorResult)
                throw Object.assign(
                    new Error('The warehouse rejected the access check.'),
                    { errors: [result.status.errorResult] },
                );
            return { kind: 'readable', reason: null };
        } catch (error) {
            const status = classifyBigqueryAccessError(error);
            if (status.kind === 'fatal') {
                if (status.reason === 'timeout')
                    return { kind: 'error', reason: 'timeout' };
                throw new AgentAccessProbeError(status.reason);
            }
            return status;
        }
    }
}
