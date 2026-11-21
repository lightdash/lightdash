import {
    ApiConnectorType,
    DimensionType,
    getSalesforceDescribePath,
    ParameterError,
    SALESFORCE_OBJECTS,
    SALESFORCE_QUERY_PATH,
    type SalesforceObject,
} from '@lightdash/common';
import { z } from 'zod';
import { tooManyRowsError } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveScanResult,
} from '../../types';
import { SalesforceObjectAccessError } from './errors';
import {
    SALESFORCE_MAX_AGGREGATE_ROWS,
    SALESFORCE_MAX_CALLS,
    SALESFORCE_MAX_RECORD_ROWS,
} from './explores';
import {
    parseSalesforceExpression,
    toSoql,
    type SalesforceAggregateColumn,
    type SalesforceColumnType,
    type SalesforceRequest,
} from './soql';

const queryResponseSchema = z.object({
    totalSize: z.number(),
    done: z.boolean(),
    nextRecordsUrl: z.string().optional(),
    records: z.array(z.record(z.string(), z.unknown())),
});

/** The next batch of a record list; anything else is refused before calling. */
const NEXT_RECORDS_PATH = new RegExp(
    `^${SALESFORCE_QUERY_PATH.replace(/\./g, '\\.')}/[A-Za-z0-9-]{1,64}$`,
);

const DIMENSION_TYPES: Record<SalesforceColumnType, DimensionType> = {
    string: DimensionType.STRING,
    number: DimensionType.NUMBER,
    boolean: DimensionType.BOOLEAN,
    date: DimensionType.DATE,
    timestamp: DimensionType.TIMESTAMP,
};

const pad = (value: number) => String(value).padStart(2, '0');

/** Salesforce writes date and times as 2026-01-31T10:00:00.000+0000. */
const toIsoTimestamp = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const date = new Date(raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** The first day of a value's period: a date, or a date and time in UTC. */
const toPeriodStart = (raw: unknown, fn: string): string | null => {
    const iso =
        typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? raw
            : toIsoTimestamp(raw)?.slice(0, 10);
    if (!iso) return null;
    const [year, month] = iso.split('-');
    switch (fn) {
        case 'CALENDAR_MONTH':
            return `${year}-${month}-01`;
        case 'CALENDAR_QUARTER':
            return `${year}-${pad(
                Math.floor((Number(month) - 1) / 3) * 3 + 1,
            )}-01`;
        case 'CALENDAR_YEAR':
            return `${year}-01-01`;
        default:
            return iso;
    }
};

const toValue = (raw: unknown, type: SalesforceColumnType): unknown => {
    if (raw === null || raw === undefined) return null;
    switch (type) {
        case 'number': {
            const number = Number(raw);
            return Number.isFinite(number) ? number : null;
        }
        case 'boolean':
            return raw === true || raw === 'true';
        case 'timestamp':
            return toIsoTimestamp(raw);
        default:
            return typeof raw === 'object' ? JSON.stringify(raw) : raw;
    }
};

/** A record's value at a path such as Owner.Name; a missing lookup reads null. */
const readPath = (record: Record<string, unknown>, field: string): unknown =>
    field.split('.').reduce<unknown>((value, key) => {
        if (value === null || typeof value !== 'object') return null;
        return (value as Record<string, unknown>)[key] ?? null;
    }, record);

const readRecordColumn = (
    record: Record<string, unknown>,
    { name, type }: SalesforceRequest['columns'][number],
): unknown => {
    const expression = parseSalesforceExpression(name);
    if (!expression) return null;
    const raw = readPath(record, expression.field);
    return expression.kind === 'date'
        ? toPeriodStart(raw, expression.fn)
        : toValue(raw, type);
};

/** An aggregate row's column from its aliases: a year and month make a month. */
const readAggregateColumn = (
    row: Record<string, unknown>,
    column: SalesforceAggregateColumn,
    type: SalesforceColumnType,
): unknown => {
    const parts = Object.fromEntries(
        column.parts.map(({ alias, part }) => [part, row[alias] ?? null]),
    );
    if (parts.value !== undefined) {
        return type === 'date' && typeof parts.value === 'string'
            ? parts.value.slice(0, 10)
            : toValue(parts.value, type);
    }
    const year = Number(parts.year);
    if (parts.year === null || !Number.isInteger(year)) return null;
    if (parts.month !== undefined) {
        const month = Number(parts.month);
        return Number.isInteger(month) ? `${year}-${pad(month)}-01` : null;
    }
    if (parts.quarter !== undefined) {
        const quarter = Number(parts.quarter);
        return Number.isInteger(quarter)
            ? `${year}-${pad((quarter - 1) * 3 + 1)}-01`
            : null;
    }
    return `${year}-01-01`;
};

const toColumns = (request: SalesforceRequest): LiveColumn[] =>
    request.columns.map(({ name, type }) => ({
        name,
        type: DIMENSION_TYPES[type],
    }));

const aggregateTooManyRowsError = () =>
    new ParameterError(
        `This Salesforce query has more than ${(
            SALESFORCE_MAX_AGGREGATE_ROWS - 1
        ).toLocaleString(
            'en-US',
        )} rows. Salesforce returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString(
            'en-US',
        )} totalled rows in one query, so its result would be incomplete. Add a filter, remove a dimension or use a coarser date.`,
    );

/**
 * One call: Salesforce groups, totals and sorts, and sends at most 2,000
 * rows. One row past the limit says whether there were more; a limit of
 * 2,000 or more can't tell, so a full batch is refused as incomplete.
 */
const runAggregate = async (
    object: SalesforceObject,
    request: SalesforceRequest,
    limit: number,
    calls: LiveCalls,
): Promise<LiveRunResult> => {
    const rowLimit = Math.min(limit, SALESFORCE_MAX_AGGREGATE_ROWS - 1);
    const { soql, aggregateColumns } = toSoql(request, object, rowLimit + 1);
    const { records } = await calls.fetch(
        {
            method: 'GET',
            path: SALESFORCE_QUERY_PATH,
            query: { q: soql },
            body: undefined,
        },
        queryResponseSchema,
    );
    if (records.length > rowLimit && limit > rowLimit) {
        throw aggregateTooManyRowsError();
    }
    const rows = records
        .slice(0, rowLimit)
        .map((row) =>
            Object.fromEntries(
                aggregateColumns.map((column, index) => [
                    column.name,
                    readAggregateColumn(
                        row,
                        column,
                        request.columns[index].type,
                    ),
                ]),
            ),
        );
    return {
        columns: toColumns(request),
        rows,
        hasMoreRows: records.length > rowLimit,
    };
};

/**
 * Lists records with one row past the limit, following nextRecordsUrl
 * batches of up to 2,000 only as far as that row. Lists longer than one
 * query can read are refused rather than cut; when smaller batches use up
 * the calls first, the rows read so far are flagged as incomplete.
 */
const runRecords = async (
    object: SalesforceObject,
    request: SalesforceRequest,
    limit: number,
    calls: LiveCalls,
): Promise<LiveRunResult> => {
    const rowLimit = Math.min(limit, SALESFORCE_MAX_RECORD_ROWS);
    const { soql } = toSoql(request, object, rowLimit + 1);
    const records: Record<string, unknown>[] = [];
    let path = SALESFORCE_QUERY_PATH;
    let query: Record<string, string> | undefined = { q: soql };
    let finished = false;
    for (let call = 0; call < SALESFORCE_MAX_CALLS; call += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await calls.fetch(
            { method: 'GET', path, query, body: undefined },
            queryResponseSchema,
        );
        records.push(...response.records);
        if (
            response.done ||
            !response.nextRecordsUrl ||
            records.length > rowLimit
        ) {
            finished = true;
            break;
        }
        if (!NEXT_RECORDS_PATH.test(response.nextRecordsUrl)) {
            throw new ParameterError(
                'Salesforce sent an unexpected link to the next records.',
            );
        }
        path = response.nextRecordsUrl;
        query = undefined;
    }
    if (records.length > rowLimit && limit > rowLimit) {
        throw tooManyRowsError({
            label: 'Salesforce',
            maxRows: SALESFORCE_MAX_RECORD_ROWS,
        });
    }
    const rows = records
        .slice(0, rowLimit)
        .map((record) =>
            Object.fromEntries(
                request.columns.map((column) => [
                    column.name,
                    readRecordColumn(record, column),
                ]),
            ),
        );
    return {
        columns: toColumns(request),
        rows,
        // Salesforce can send smaller batches, so the last call may stop short.
        hasMoreRows: records.length > rowLimit || !finished,
    };
};

/** Runs one SOQL query on the request's object. */
export const runSalesforceQuery = async ({
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.SALESFORCE,
    SalesforceRequest
>): Promise<LiveRunResult> =>
    request.kind === 'aggregate'
        ? runAggregate(request.object, request, limit, calls)
        : runRecords(request.object, request, limit, calls);

/**
 * Reads each object's describe, whose fields become its explore's fields.
 * An object the signed-in user can't read keeps its built-in fields; any
 * other failed call, such as a throttled one, fails the scan so the last
 * good scan stays.
 */
export const scanSalesforceDescribe = async ({
    calls,
}: {
    calls: LiveCalls;
}): Promise<LiveScanResult> => {
    const results = await Promise.allSettled(
        SALESFORCE_OBJECTS.map((object) =>
            calls.fetch(
                {
                    method: 'GET',
                    path: getSalesforceDescribePath(object),
                    body: undefined,
                },
                z.unknown(),
            ),
        ),
    );
    const failed = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    const [unexpected] = failed.filter(
        (error) => !(error instanceof SalesforceObjectAccessError),
    );
    if (unexpected !== undefined) {
        throw unexpected;
    }
    const read = SALESFORCE_OBJECTS.flatMap((object, index) => {
        const result = results[index];
        return result.status === 'fulfilled' ? [[object, result.value]] : [];
    });
    if (read.length === 0) {
        throw failed[0];
    }
    return { salesforceDescribe: Object.fromEntries(read) };
};
