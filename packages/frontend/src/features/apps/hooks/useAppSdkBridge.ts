import {
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ResultRow as ApiResultRow,
} from '@lightdash/common';
import { useCallback, useEffect, type RefObject } from 'react';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';

// ---------------------------------------------------------------------------
// postMessage protocol types (mirrors packages/query-sdk/src/postMessageTransport.ts)
// ---------------------------------------------------------------------------

type QueryDefinition = {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: Array<{
        fieldId: string;
        operator: string;
        values: Array<string | number | boolean>;
        settings: { unitOfTime: string } | null;
    }>;
    sorts: Array<{ fieldId: string; descending: boolean }>;
    limit: number;
};

type SdkRow = Record<string, string | number | boolean | null>;

type SdkColumn = {
    name: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'timestamp' | 'boolean';
};

type SerializedQueryResult = {
    rows: SdkRow[];
    columns: SdkColumn[];
    formattedRows: Array<Record<string, string>>;
};

type SdkRequestMessage = {
    type: 'lightdash:sdk:request';
    id: string;
    method: 'executeQuery' | 'getUser';
    payload?: QueryDefinition;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const qualify = (table: string, fieldId: string): string =>
    fieldId.startsWith(`${table}_`) ? fieldId : `${table}_${fieldId}`;

function mapColumnType(type: string): SdkColumn['type'] {
    if (/timestamp/i.test(type)) return 'timestamp';
    if (/date/i.test(type)) return 'date';
    if (
        /number|int|float|average|count|sum|min|max|median|percentile/i.test(
            type,
        )
    )
        return 'number';
    if (/boolean/i.test(type)) return 'boolean';
    return 'string';
}

function buildApiFilters(
    filters: QueryDefinition['filters'],
): Record<string, unknown> {
    if (filters.length === 0) return {};
    const rules = filters.map((f, i) => ({
        id: `sdk-filter-${i}`,
        target: { fieldId: f.fieldId },
        operator: f.operator,
        values: f.values,
        ...(f.settings ? { settings: f.settings } : {}),
    }));
    return { dimensions: { id: 'sdk-root', and: rules } };
}

/**
 * Executes a query definition against the Lightdash async metrics API
 * using the current user's session and returns a serialized result
 * suitable for sending over postMessage.
 */
async function executeQueryForBridge(
    projectUuid: string,
    query: QueryDefinition,
): Promise<SerializedQueryResult> {
    const table = query.exploreName;
    const q = (fieldId: string) => qualify(table, fieldId);
    const qualifiedDims = query.dimensions.map(q);
    const qualifiedMetrics = query.metrics.map(q);

    // POST async metric query
    const execResult = await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/query/metric-query`,
        version: 'v2',
        body: JSON.stringify({
            query: {
                exploreName: table,
                dimensions: qualifiedDims,
                metrics: qualifiedMetrics,
                filters: buildApiFilters(
                    query.filters.map((f) => ({ ...f, fieldId: q(f.fieldId) })),
                ),
                sorts: query.sorts.map((s) => ({
                    fieldId: q(s.fieldId),
                    descending: s.descending,
                })),
                limit: query.limit,
                tableCalculations: [],
            },
        }),
    });

    // Poll for results
    const pollResult: ApiGetAsyncQueryResults = await pollForResults(
        projectUuid,
        execResult.queryUuid,
    );

    if (
        pollResult.status === QueryHistoryStatus.ERROR ||
        pollResult.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(
            'error' in pollResult
                ? (pollResult.error ?? 'Query failed')
                : 'Query failed',
        );
    }

    if (pollResult.status !== QueryHistoryStatus.READY) {
        throw new Error(`Unexpected query status: ${pollResult.status}`);
    }

    // Map qualified → short field names
    const allShort = [...query.dimensions, ...query.metrics];
    const allQualified = [...qualifiedDims, ...qualifiedMetrics];
    const qualifiedToShort = new Map<string, string>();
    for (let i = 0; i < allShort.length; i++) {
        qualifiedToShort.set(allQualified[i], allShort[i]);
    }

    // Build columns
    const { fields } = execResult;
    const columns: SdkColumn[] = allQualified.map((qFieldId) => {
        const shortName = qualifiedToShort.get(qFieldId) ?? qFieldId;
        const fieldMeta = fields[qFieldId];
        const colMeta = pollResult.columns[qFieldId];
        const fieldLabel =
            fieldMeta && 'label' in fieldMeta
                ? (fieldMeta as { label?: string }).label
                : undefined;
        return {
            name: shortName,
            label: fieldLabel ?? shortName,
            type: mapColumnType(colMeta?.type ?? fieldMeta?.type ?? 'string'),
        };
    });

    // Map rows and formatted values
    const rows: SdkRow[] = [];
    const formattedRows: Array<Record<string, string>> = [];

    for (const apiRow of pollResult.rows as ApiResultRow[]) {
        const row: SdkRow = {};
        const formatted: Record<string, string> = {};

        for (const qFieldId of allQualified) {
            const shortName = qualifiedToShort.get(qFieldId) ?? qFieldId;
            const cell = apiRow[qFieldId];
            if (!cell) {
                row[shortName] = null;
                formatted[shortName] = '';
                continue;
            }
            const { raw, formatted: fmt } = cell.value;
            formatted[shortName] = fmt;

            if (raw === null || raw === undefined) {
                row[shortName] = null;
            } else if (typeof raw === 'number') {
                row[shortName] = raw;
            } else if (typeof raw === 'boolean') {
                row[shortName] = raw;
            } else {
                row[shortName] = String(raw);
            }
        }

        rows.push(row);
        formattedRows.push(formatted);
    }

    return { rows, columns, formattedRows };
}

async function getUserForBridge() {
    const user = await lightdashApi<
        {
            userUuid: string;
            firstName: string;
            lastName: string;
            email: string;
            role: string;
            organizationUuid: string;
            userAttributes?: Record<string, string>;
            // LightdashUser is not part of ApiResults, so we cast through unknown
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } & Record<string, any>
    >({
        method: 'GET',
        url: '/user',
        version: 'v1',
        body: undefined,
    });

    return {
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
        orgId: user.organizationUuid,
        attributes: user.userAttributes ?? {},
    };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Parent-side bridge that handles postMessage requests from a sandboxed
 * iframe running the query-sdk's postMessageTransport.
 *
 * Listens for `lightdash:sdk:request` messages from the iframe, executes
 * the query using the current user's session, and posts the result back.
 */
export function useAppSdkBridge(
    projectUuid: string,
    iframeRef: RefObject<HTMLIFrameElement | null>,
) {
    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            // Security: only accept messages from our iframe
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (
                !data ||
                typeof data !== 'object' ||
                data.type !== 'lightdash:sdk:request'
            ) {
                return;
            }

            const msg = data as SdkRequestMessage;
            const respond = (response: {
                result?: unknown;
                error?: string;
            }) => {
                iframeRef.current?.contentWindow?.postMessage(
                    {
                        type: 'lightdash:sdk:response' as const,
                        id: msg.id,
                        ...response,
                    },
                    '*',
                );
            };

            try {
                if (msg.method === 'executeQuery' && msg.payload) {
                    const result = await executeQueryForBridge(
                        projectUuid,
                        msg.payload,
                    );
                    respond({ result });
                } else if (msg.method === 'getUser') {
                    const user = await getUserForBridge();
                    respond({ result: user });
                } else {
                    respond({ error: `Unknown method: ${msg.method}` });
                }
            } catch (err) {
                respond({
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        },
        [projectUuid, iframeRef],
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    // Send ready signal when the iframe loads
    const handleIframeLoad = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:sdk:ready' },
            '*',
        );
    }, [iframeRef]);

    return { handleIframeLoad };
}
