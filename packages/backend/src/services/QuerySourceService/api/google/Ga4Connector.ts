import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    UnexpectedServerError,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    ApiConnector,
    ApiConnectorColumn,
    ApiConnectorDescription,
    ApiConnectorExecuteArgs,
    ApiConnectorResult,
    ApiConnectorTransport,
} from '../ApiConnector';
import { toGoogleApiError } from './googleApiError';

export const GA4_DATA_ORIGIN = 'https://analyticsdata.googleapis.com';

// One report returns up to 250,000 rows; results stay at the size of other
// api sources. The connector asks for one more than the limit to detect
// truncation itself.
const GA4_MAX_ROWS = 25_000;
const GA4_TIMEOUT_MS = 30_000;
// Standard properties allow 10 concurrent requests; reports spend hourly
// tokens per property, which Google enforces and reports back.
const GA4_LIMITS = {
    concurrentCalls: 5,
    callsPerMinute: 60,
    callsPerHour: 1_000,
    callsPerQuery: 1,
};

const GA4_DATE = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/;
const GA4_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_:]*$/;

const fieldSchema = z
    .object({ name: z.string().regex(GA4_FIELD_NAME, 'Use a GA4 API name') })
    .strict();

// Filters and orderings are passed through; Google validates them and
// rejects bad ones with a message the agent can act on.
const requestSchema = z
    .object({
        dateRanges: z
            .array(
                z
                    .object({
                        startDate: z
                            .string()
                            .regex(GA4_DATE, 'Use YYYY-MM-DD or NdaysAgo'),
                        endDate: z
                            .string()
                            .regex(GA4_DATE, 'Use YYYY-MM-DD or NdaysAgo'),
                        name: z.string().optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(4),
        dimensions: z.array(fieldSchema).max(9).optional(),
        metrics: z.array(fieldSchema).min(1).max(10),
        dimensionFilter: z.record(z.string(), z.unknown()).optional(),
        metricFilter: z.record(z.string(), z.unknown()).optional(),
        orderBys: z.array(z.record(z.string(), z.unknown())).optional(),
        keepEmptyRows: z.boolean().optional(),
        currencyCode: z.string().optional(),
        // Agents often copy the API's own limit; the smaller limit wins.
        limit: z.number().int().positive().optional(),
    })
    .strict();

const responseSchema = z.object({
    dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
    metricHeaders: z
        .array(z.object({ name: z.string(), type: z.string().optional() }))
        .optional(),
    rows: z
        .array(
            z.object({
                dimensionValues: z
                    .array(z.object({ value: z.string().optional() }))
                    .optional(),
                metricValues: z
                    .array(z.object({ value: z.string().optional() }))
                    .optional(),
            }),
        )
        .optional(),
    rowCount: z.number().optional(),
});

export type Ga4ConnectorArgs = {
    propertyId: string;
    /** Sends to the GA4 Data API with the connection's Google sign-in attached. */
    send: ApiConnectorTransport;
};

export const getGa4ReportPath = (propertyId: string) =>
    `/v1beta/properties/${propertyId}:runReport`;

const parseRequest = (query: string): z.infer<typeof requestSchema> => {
    let json: unknown;
    try {
        json = JSON.parse(query);
    } catch {
        throw new ParameterError(
            'The GA4 report request must be a JSON object',
        );
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        throw new ParameterError(
            `Invalid GA4 report request at ${
                issue.path.join('.') || 'the top level'
            }: ${issue.message}`,
        );
    }
    return parsed.data;
};

// GA4 names custom fields like customEvent:plan; columns need plain names.
const toColumnName = (name: string) => name.replace(/[^A-Za-z0-9_]/g, '_');

// GA4 reports dates as YYYYMMDD.
const toIsoDate = (value: string) =>
    /^\d{8}$/.test(value)
        ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
        : value;

const toNumber = (value: string | undefined) => {
    if (value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

export class Ga4Connector implements ApiConnector {
    private readonly propertyId: string;

    private readonly send: ApiConnectorTransport;

    constructor({ propertyId, send }: Ga4ConnectorArgs) {
        this.propertyId = propertyId;
        this.send = send;
    }

    // eslint-disable-next-line class-methods-use-this
    describe(): ApiConnectorDescription {
        return {
            connector: ApiConnectorType.GA4,
            label: 'Google Analytics',
            level: 3,
            queryLanguage: 'GA4 runReport JSON',
            maxRows: GA4_MAX_ROWS - 1,
            timeoutMs: GA4_TIMEOUT_MS,
            limits: GA4_LIMITS,
        };
    }

    async execute({
        payload,
        limit,
    }: ApiConnectorExecuteArgs): Promise<ApiConnectorResult> {
        if (!Number.isInteger(limit) || limit < 1 || limit >= GA4_MAX_ROWS) {
            throw new ParameterError(
                `limit must be between 1 and ${GA4_MAX_ROWS - 1} rows`,
            );
        }
        const { limit: requestLimit, ...request } = parseRequest(payload.query);
        const rowLimit = Math.min(limit, requestLimit ?? limit);

        const response = await this.send({
            method: 'POST',
            path: getGa4ReportPath(this.propertyId),
            body: { ...request, limit: rowLimit + 1, offset: 0 },
        });
        if (response.status < 200 || response.status >= 300) {
            throw toGoogleApiError(response, {
                label: 'Google Analytics',
                resource: `property ${this.propertyId}`,
            });
        }
        const parsed = responseSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new UnexpectedServerError(
                'Google Analytics returned a response in an unexpected shape',
            );
        }

        const dimensionNames = (parsed.data.dimensionHeaders ?? []).map(
            ({ name }) => name,
        );
        const metricNames = (parsed.data.metricHeaders ?? []).map(
            ({ name }) => name,
        );
        const columns: ApiConnectorColumn[] = [
            ...dimensionNames.map((name) => ({
                name: toColumnName(name),
                type:
                    name === 'date' ? DimensionType.DATE : DimensionType.STRING,
            })),
            ...metricNames.map((name) => ({
                name: toColumnName(name),
                type: DimensionType.NUMBER,
            })),
        ];
        if (new Set(columns.map(({ name }) => name)).size < columns.length) {
            throw new ParameterError(
                'Two GA4 fields map to the same column name; request each field once',
            );
        }

        const apiRows = parsed.data.rows ?? [];
        const rows = apiRows.slice(0, rowLimit).map((row) => ({
            ...Object.fromEntries(
                dimensionNames.map((name, index) => {
                    const value = row.dimensionValues?.[index]?.value ?? null;
                    return [
                        toColumnName(name),
                        name === 'date' && value !== null
                            ? toIsoDate(value)
                            : value,
                    ];
                }),
            ),
            ...Object.fromEntries(
                metricNames.map((name, index) => [
                    toColumnName(name),
                    toNumber(row.metricValues?.[index]?.value),
                ]),
            ),
        }));
        return {
            columns,
            rows,
            truncated:
                apiRows.length > rowLimit ||
                (parsed.data.rowCount ?? 0) > rowLimit,
            bytesRead: null,
        };
    }
}
