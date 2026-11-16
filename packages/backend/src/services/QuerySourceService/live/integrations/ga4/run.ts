import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import type { LiveColumn } from '../../connector';
import {
    assertMaxRows,
    type LiveCalls,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../defineLiveIntegration';
import type { LiveScanResult } from '../../integration';

export const GA4_DATA_ORIGIN = 'https://analyticsdata.googleapis.com';

// One report returns up to 250,000 rows; results stay at the size of other
// api sources. The connector asks for one more than the limit to detect
// truncation itself.
export const GA4_MAX_QUERY_ROWS = 24_999;

const GA4_DATE = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/;
const GA4_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_:]*$/;

const fieldSchema = z
    .object({ name: z.string().regex(GA4_FIELD_NAME, 'Use a GA4 API name') })
    .strict();

// Filters and orderings are passed through; Google validates them and
// rejects bad ones with a message the agent can act on.
/** A runReport request, as compile writes it and agents send it. */
export const ga4RequestSchema = z
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

export type Ga4Request = z.infer<typeof ga4RequestSchema>;

export const getGa4ReportPath = (propertyId: string) =>
    `/v1beta/properties/${propertyId}:runReport`;

export const getGa4MetadataPath = (propertyId: string) =>
    `/v1beta/properties/${propertyId}/metadata`;

// GA4 names custom fields like customEvent:plan; columns need plain names.
export const toGa4ColumnName = (name: string) =>
    name.replace(/[^A-Za-z0-9_]/g, '_');

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

/** Reads the property's dimensions and metrics, including its custom ones. */
export const scanGa4Metadata = async ({
    settings: { propertyId },
    calls,
}: {
    settings: { propertyId: string };
    calls: LiveCalls;
}): Promise<LiveScanResult> => {
    const response = await calls.send({
        method: 'GET',
        path: getGa4MetadataPath(propertyId),
        body: null,
    });
    return { ga4Metadata: response.body };
};

/** Runs one report, asking for one row more than the limit. */
export const runGa4Query = async ({
    settings: { propertyId },
    request: { limit: requestLimit, ...request },
    limit,
    calls,
}: LiveRunArgs<ApiConnectorType.GA4, Ga4Request>): Promise<LiveRunResult> => {
    assertMaxRows(limit, GA4_MAX_QUERY_ROWS);
    const rowLimit = Math.min(limit, requestLimit ?? limit);
    const report = await calls.fetch(
        {
            method: 'POST',
            path: getGa4ReportPath(propertyId),
            body: { ...request, limit: rowLimit + 1, offset: 0 },
        },
        responseSchema,
    );

    const dimensionNames = (report.dimensionHeaders ?? []).map(
        ({ name }) => name,
    );
    const metricNames = (report.metricHeaders ?? []).map(({ name }) => name);
    const columns: LiveColumn[] = [
        ...dimensionNames.map((name) => ({
            name: toGa4ColumnName(name),
            type: name === 'date' ? DimensionType.DATE : DimensionType.STRING,
        })),
        ...metricNames.map((name) => ({
            name: toGa4ColumnName(name),
            type: DimensionType.NUMBER,
        })),
    ];
    if (new Set(columns.map(({ name }) => name)).size < columns.length) {
        throw new ParameterError(
            'Two GA4 fields map to the same column name; request each field once',
        );
    }

    const apiRows = report.rows ?? [];
    const rows = apiRows.slice(0, rowLimit).map((row) => ({
        ...Object.fromEntries(
            dimensionNames.map((name, index) => {
                const value = row.dimensionValues?.[index]?.value ?? null;
                return [
                    toGa4ColumnName(name),
                    name === 'date' && value !== null
                        ? toIsoDate(value)
                        : value,
                ];
            }),
        ),
        ...Object.fromEntries(
            metricNames.map((name, index) => [
                toGa4ColumnName(name),
                toNumber(row.metricValues?.[index]?.value),
            ]),
        ),
    }));
    return {
        columns,
        rows,
        hasMoreRows:
            apiRows.length > rowLimit || (report.rowCount ?? 0) > rowLimit,
    };
};
