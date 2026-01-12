import { URL } from 'url';
import { LightdashConfig } from '../../config/parseConfig';

type MetricFlowRestEnvelope<T> = {
    ok: boolean;
    data?: T | null;
    error?: {
        code?: string;
        message?: string;
        details?: unknown;
    } | null;
};

type MetricFlowQueryPayload = {
    projectId: string;
    metrics: Array<{ name: string }>;
    groupBy?: Array<{ name: string; grain?: string | null }>;
    filters?: unknown;
    orderBy?: Array<{
        metric?: { name: string };
        groupBy?: { name: string };
        descending?: boolean;
    }>;
    limit?: number;
};

type MetricFlowBuildPayload = {
    projectId: string;
    gitRef?: string;
    forceRecompile?: boolean;
};

type MetricFlowGroupByInput = {
    name: string;
    grain?: string | null;
};

type MetricFlowDimensionValuesPayload = {
    projectId: string;
    dimension: string;
    metrics?: string[];
    startTime?: string;
    endTime?: string;
    search?: string;
    limit?: number;
};

type MetricFlowRestClientArgs = {
    lightdashConfig: LightdashConfig;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * REST 客户端对接 MetricFlow Service（FastAPI）
 */
export default class MetricFlowRestClient {
    private readonly baseUrl: string;

    private readonly apiToken?: string;

    private readonly timeoutMs: number;

    constructor({ lightdashConfig }: MetricFlowRestClientArgs) {
        this.baseUrl = lightdashConfig.metricflow.baseUrl;
        this.apiToken = lightdashConfig.metricflow.apiToken;
        this.timeoutMs =
            lightdashConfig.metricflow.timeoutMs || DEFAULT_TIMEOUT_MS;
    }

    private buildUrl(
        path: string,
        query?: Record<
            string,
            | string
            | number
            | boolean
            | Array<string | number | boolean>
            | undefined
        >,
    ) {
        const url = new URL(path, this.baseUrl);

        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value === undefined) return;
                if (Array.isArray(value)) {
                    if (value.length === 0) return;
                    url.searchParams.set(key, value.join(','));
                    return;
                }
                url.searchParams.set(key, String(value));
            });
        }

        return url;
    }

    private getHeaders(
        hasBody: boolean,
        apiTokenOverride?: string,
    ): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
        };

        if (hasBody) {
            headers['Content-Type'] = 'application/json';
        }

        const token = apiTokenOverride || this.apiToken;

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    }

    private async request<T>(
        path: string,
        options?: {
            method?: 'GET' | 'POST';
            query?: Record<
                string,
                | string
                | number
                | boolean
                | Array<string | number | boolean>
                | undefined
            >;
            body?: unknown;
            apiTokenOverride?: string;
        },
    ): Promise<T | null> {
        const url = this.buildUrl(path, options?.query);
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            this.timeoutMs || DEFAULT_TIMEOUT_MS,
        );

        try {
            const response = await fetch(url, {
                method: options?.method ?? 'GET',
                headers: this.getHeaders(
                    options?.body !== undefined,
                    options?.apiTokenOverride,
                ),
                body:
                    options?.body !== undefined
                        ? JSON.stringify(options.body)
                        : undefined,
                signal: controller.signal,
            });

            const payload =
                (await response.json()) as MetricFlowRestEnvelope<T>;

            if (!response.ok) {
                const detail =
                    payload?.error?.message ||
                    (payload as { error?: { code?: string } })?.error?.code ||
                    '';
                throw new Error(
                    `MetricFlow REST request failed (${response.status})${
                        detail ? `: ${detail}` : ''
                    }`,
                );
            }

            if (!payload.ok) {
                const detail =
                    payload?.error?.message ||
                    (payload as { error?: { code?: string } })?.error?.code ||
                    '';
                throw new Error(
                    detail
                        ? `MetricFlow REST request failed: ${detail}`
                        : 'MetricFlow REST request failed',
                );
            }

            return payload.data ?? null;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new Error(
                    `MetricFlow REST request timed out after ${this.timeoutMs}ms`,
                );
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async getSemanticModels(projectId: string, apiTokenOverride?: string) {
        return this.request<{ semanticModels?: unknown[] }>(
            '/api/semantic-models',
            { query: { projectId }, apiTokenOverride },
        );
    }

    async getMetrics(
        projectId: string,
        dimensions?: string[],
        apiTokenOverride?: string,
    ) {
        return this.request<{ metrics?: unknown[] }>('/api/metrics', {
            query: { projectId, dimensions },
            apiTokenOverride,
        });
    }

    async getDimensions(
        projectId: string,
        metrics?: string[],
        apiTokenOverride?: string,
    ) {
        return this.request<{ dimensions?: unknown[] }>('/api/dimensions', {
            query: { projectId, metrics },
            apiTokenOverride,
        });
    }

    async getMetricsForDimensions(
        projectId: string,
        dimensions: MetricFlowGroupByInput[],
        apiTokenOverride?: string,
    ) {
        return this.request<{ metricsForDimensions?: unknown[] }>(
            '/api/metrics-for-dimensions',
            {
                method: 'POST',
                body: {
                    projectId,
                    dimensions,
                },
                apiTokenOverride,
            },
        );
    }

    async createQuery(
        payload: MetricFlowQueryPayload,
        apiTokenOverride?: string,
    ) {
        return this.request<{ createQuery?: { queryId: string } }>(
            '/api/queries',
            {
                method: 'POST',
                body: payload,
                apiTokenOverride,
            },
        );
    }

    async getQuery(
        projectId: string,
        queryId: string,
        apiTokenOverride?: string,
    ) {
        return this.request<{ query?: unknown }>(
            `/api/queries/${encodeURIComponent(queryId)}`,
            {
                query: { projectId },
                apiTokenOverride,
            },
        );
    }

    async validateQuery(
        payload: MetricFlowQueryPayload,
        apiTokenOverride?: string,
    ) {
        return this.request<{ warnings?: unknown[]; errors?: unknown[] }>(
            '/api/query/validate',
            {
                method: 'POST',
                body: payload,
                apiTokenOverride,
            },
        );
    }

    async compileSql(
        payload: MetricFlowQueryPayload,
        apiTokenOverride?: string,
    ) {
        return this.request<{ compileSql?: unknown }>('/api/compile-sql', {
            method: 'POST',
            body: payload,
            apiTokenOverride,
        });
    }

    async getDimensionValues(
        payload: MetricFlowDimensionValuesPayload,
        apiTokenOverride?: string,
    ) {
        return this.request<{
            dimension?: string;
            values?: unknown[];
            totalCount?: number;
            dimensionValues?: unknown[];
        }>('/api/dimension-values', {
            method: 'POST',
            body: payload,
            apiTokenOverride,
        });
    }

    async triggerBuild(
        payload: MetricFlowBuildPayload,
        apiTokenOverride?: string,
    ) {
        return this.request<{ buildId?: string }>('/api/build', {
            method: 'POST',
            body: payload,
            apiTokenOverride,
        });
    }

    async getBuildStatus(
        projectId: string,
        buildId: string,
        apiTokenOverride?: string,
    ) {
        return this.request<{ build?: unknown }>(
            `/api/build/${encodeURIComponent(buildId)}`,
            {
                query: { projectId },
                apiTokenOverride,
            },
        );
    }
}
