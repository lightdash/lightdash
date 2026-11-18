import {
    ApiConnectorType,
    DimensionType,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap, tooManyRowsError } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveScanResult,
} from '../../types';
import { parseAttioApiName, type AttioValueProperty } from './attributes';
import {
    ATTIO_MAX_PAGES,
    ATTIO_MAX_RECORDS,
    ATTIO_PAGE_SIZE,
} from './explores';

const LABEL = 'Attio';

const VALUE_PROPERTIES = [
    'currency_value',
    'option',
    'status',
    'full_name',
    'email_address',
    'domain',
    'original_phone_number',
    'address',
    'target_record_id',
    'referenced_actor_id',
    'interacted_at',
] as const satisfies readonly AttioValueProperty[];

const BUILT_IN_COLUMNS = [
    'record_id',
    'web_url',
    'created_at',
    'created_at_week',
    'created_at_month',
    'created_at_year',
] as const;

const ATTRIBUTE_COLUMN = new RegExp(
    `^[a-z0-9_]+(\\.(${VALUE_PROPERTIES.join('|')}))?$`,
);

const COUNT = 'count';
const TOTAL_PREFIX = 'total:';

const isMetricColumn = (column: string) =>
    column === COUNT || column.startsWith(TOTAL_PREFIX);

const columnSchema = z
    .string()
    .refine(
        (column) =>
            column === COUNT ||
            ATTRIBUTE_COLUMN.test(
                column.startsWith(TOTAL_PREFIX)
                    ? column.slice(TOTAL_PREFIX.length)
                    : column,
            ),
        {
            message: `columns are attribute slugs, optionally with .property (${VALUE_PROPERTIES.join(
                ', ',
            )}), built-in fields (${BUILT_IN_COLUMNS.join(
                ', ',
            )}), count, or total:<attribute>`,
        },
    );

const sortSchema = z
    .object({
        attribute: z.string(),
        field: z.string().optional(),
        direction: z.enum(['asc', 'desc']),
    })
    .strict();

export type AttioSort = z.infer<typeof sortSchema>;

/**
 * One records query, as compile writes it. With count or a total among the
 * columns, records are grouped by the other columns.
 */
export const attioRequestSchema = z
    .object({
        columns: z.array(columnSchema).min(1),
        /** Attio's own filter object, sent as it is. */
        filter: z.record(z.string(), z.unknown()).optional(),
        sorts: z.array(sortSchema).optional(),
    })
    .strict();

export type AttioRequest = z.infer<typeof attioRequestSchema>;

const valueSchema = z.record(z.string(), z.unknown());

const recordSchema = z.object({
    id: z.object({ record_id: z.string() }),
    created_at: z.string(),
    web_url: z.string().optional(),
    values: z.record(z.string(), z.array(valueSchema)),
});
type AttioRecord = z.infer<typeof recordSchema>;

const recordsResponseSchema = z.object({ data: z.array(recordSchema) });

const DAY_MS = 86_400_000;

const toWeekStart = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    // Weeks start on Monday
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return new Date(date.getTime() - daysSinceMonday * DAY_MS)
        .toISOString()
        .slice(0, 10);
};

const readBuiltIn = (
    record: AttioRecord,
    column: (typeof BUILT_IN_COLUMNS)[number],
): unknown => {
    const day = record.created_at.slice(0, 10);
    switch (column) {
        case 'record_id':
            return record.id.record_id;
        case 'web_url':
            return record.web_url ?? null;
        case 'created_at':
            return day;
        case 'created_at_week':
            return toWeekStart(day);
        case 'created_at_month':
            return `${day.slice(0, 7)}-01`;
        case 'created_at_year':
            return `${day.slice(0, 4)}-01-01`;
        default:
            return null;
    }
};

const titleOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'title' in value
        ? (value as { title: unknown }).title
        : null;

const ADDRESS_PARTS = [
    'line_1',
    'line_2',
    'locality',
    'region',
    'postcode',
    'country_code',
];

const readValue = (
    value: Record<string, unknown>,
    property: AttioValueProperty | null,
): unknown => {
    switch (property) {
        case null:
            return value.value;
        case 'option':
            return titleOf(value.option);
        case 'status':
            return titleOf(value.status);
        case 'address':
            return (
                ADDRESS_PARTS.map((part) => value[part])
                    .filter(
                        (part): part is string =>
                            typeof part === 'string' && part.trim() !== '',
                    )
                    .join(', ') || null
            );
        default:
            return value[property];
    }
};

/** An attribute's current values: text joined with commas, otherwise the first. */
const readAttribute = (record: AttioRecord, column: string): unknown => {
    const { slug, property } = parseAttioApiName(column);
    const values = (record.values[slug] ?? [])
        .filter(({ active_until: activeUntil }) => !activeUntil)
        .map((value) => readValue(value, property))
        .filter((value) => value !== null && value !== undefined);
    if (values.length === 0) {
        return null;
    }
    return values.every((value) => typeof value === 'string')
        ? values.join(', ')
        : values[0];
};

const readColumn = (record: AttioRecord, column: string): unknown =>
    (BUILT_IN_COLUMNS as readonly string[]).includes(column)
        ? readBuiltIn(record, column as (typeof BUILT_IN_COLUMNS)[number])
        : readAttribute(record, column);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

const toColumnType = (
    column: string,
    rows: Record<string, unknown>[],
): DimensionType => {
    if (isMetricColumn(column)) {
        return DimensionType.NUMBER;
    }
    if (column.startsWith('created_at')) {
        return DimensionType.DATE;
    }
    const sample = rows.find((row) => row[column] !== null)?.[column];
    if (typeof sample === 'number') return DimensionType.NUMBER;
    if (typeof sample === 'boolean') return DimensionType.BOOLEAN;
    if (typeof sample === 'string' && ISO_DATE.test(sample)) {
        return DimensionType.DATE;
    }
    if (typeof sample === 'string' && ISO_TIMESTAMP.test(sample)) {
        return DimensionType.TIMESTAMP;
    }
    return DimensionType.STRING;
};

/** Reads matching records page by page, refusing past what one query can read. */
const readRecords = async ({
    object,
    request,
    requestedRows,
    calls,
}: {
    object: string;
    request: AttioRequest;
    requestedRows: number;
    calls: LiveCalls;
}) => {
    const records: AttioRecord[] = [];
    const { hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: ATTIO_MAX_RECORDS,
        pageSize: ATTIO_PAGE_SIZE,
        maxPages: ATTIO_MAX_PAGES,
        fetchPage: async ({ limit, cursor }) => {
            const offset = cursor ? Number(cursor) : 0;
            const { data } = await calls.fetch(
                {
                    method: 'POST',
                    path: getAttioRecordsQueryPath(object),
                    body: {
                        ...(request.filter ? { filter: request.filter } : {}),
                        ...(request.sorts ? { sorts: request.sorts } : {}),
                        limit,
                        offset,
                    },
                },
                recordsResponseSchema,
            );
            records.push(...data);
            return {
                // Rows are only counted here; records keep the values
                rows: data.map(() => ({})),
                nextCursor:
                    data.length === limit
                        ? String(offset + data.length)
                        : undefined,
            };
        },
    });
    return { records: records.slice(0, requestedRows), hasMoreRows };
};

/** Groups records by the dimension columns, counting and totalling each group. */
const aggregate = (records: AttioRecord[], columns: string[]) => {
    const dimensions = columns.filter((column) => !isMetricColumn(column));
    const totals = columns.filter((column) => column.startsWith(TOTAL_PREFIX));
    const groups = new Map<string, Record<string, unknown>>();
    records.forEach((record) => {
        const values = dimensions.map((column) => readColumn(record, column));
        const key = JSON.stringify(values);
        const group = groups.get(key) ?? {
            ...Object.fromEntries(
                dimensions.map((column, index) => [column, values[index]]),
            ),
            [COUNT]: 0,
            ...Object.fromEntries(totals.map((column) => [column, null])),
        };
        group[COUNT] = Number(group[COUNT]) + 1;
        totals.forEach((column) => {
            const raw = readAttribute(
                record,
                column.slice(TOTAL_PREFIX.length),
            );
            const value = Number(raw);
            if (raw !== null && raw !== '' && Number.isFinite(value)) {
                group[column] = Number(group[column] ?? 0) + value;
            }
        });
        groups.set(key, group);
    });
    return [...groups.values()].map((group) =>
        Object.fromEntries(columns.map((column) => [column, group[column]])),
    );
};

/**
 * Runs one Attio records query. Listing reads the rows asked for; count and
 * totals read every matching record and are refused past what one query can
 * read, since a partial count would be wrong.
 */
export const runAttioQuery = async ({
    settings: { object },
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.ATTIO,
    AttioRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, ATTIO_MAX_RECORDS);
    const { columns } = request;
    const isAggregate = columns.some(isMetricColumn);
    const { records, hasMoreRows } = await readRecords({
        object,
        request,
        requestedRows: isAggregate ? ATTIO_MAX_RECORDS : limit,
        calls,
    });
    if (isAggregate && hasMoreRows) {
        throw tooManyRowsError({ label: LABEL, maxRows: ATTIO_MAX_RECORDS });
    }
    const rows = isAggregate
        ? aggregate(records, columns)
        : records.map((record) =>
              Object.fromEntries(
                  columns.map((column) => [column, readColumn(record, column)]),
              ),
          );
    return {
        columns: columns.map(
            (name): LiveColumn => ({ name, type: toColumnType(name, rows) }),
        ),
        rows: rows.slice(0, limit),
        hasMoreRows: isAggregate ? rows.length > limit : hasMoreRows,
    };
};

/** Reads the object's attributes, which become its fields. */
export const scanAttioAttributes = async ({
    settings: { object },
    calls,
}: {
    settings: { object: string };
    calls: LiveCalls;
}): Promise<LiveScanResult> => ({
    attioAttributes: await calls.fetch(
        {
            method: 'GET',
            path: getAttioAttributesPath(object),
            body: undefined,
        },
        z.unknown(),
    ),
});
