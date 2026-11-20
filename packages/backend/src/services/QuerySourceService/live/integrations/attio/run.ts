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

const BUILT_IN_COLUMNS = ['record_id', 'web_url', 'created_at'] as const;

const ATTRIBUTE_COLUMN = new RegExp(
    `^[a-z0-9_]+(\\.(${VALUE_PROPERTIES.join('|')}))?$`,
);

const columnSchema = z
    .string()
    .refine((column) => ATTRIBUTE_COLUMN.test(column), {
        message: `columns are attribute slugs, optionally with .property (${VALUE_PROPERTIES.join(
            ', ',
        )}), or built-in fields (${BUILT_IN_COLUMNS.join(', ')})`,
    });

const sortSchema = z
    .object({
        attribute: z.string(),
        field: z.string().optional(),
        direction: z.enum(['asc', 'desc']),
    })
    .strict();

export type AttioSort = z.infer<typeof sortSchema>;

/** One records query, as compile writes it: one row per record. */
export const attioRequestSchema = z
    .object({
        columns: z.array(columnSchema).min(1),
        /** Attio's own filter object, sent as it is. */
        filter: z.record(z.string(), z.unknown()).optional(),
        sorts: z.array(sortSchema).optional(),
        /**
         * The rows are sorted here, so the query needs every matching
         * record and is refused, not cut off, past the cap.
         */
        readsAllRecords: z.boolean().optional(),
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

/**
 * A record with only the attributes the query reads, current values only.
 * Attio returns every attribute of every record, tens of KB each, and its
 * query endpoint can't select attributes, so the rest is dropped per page.
 */
const keepColumns = (
    record: AttioRecord,
    slugs: ReadonlySet<string>,
): AttioRecord => ({
    id: { record_id: record.id.record_id },
    created_at: record.created_at,
    web_url: record.web_url,
    values: Object.fromEntries(
        Object.entries(record.values)
            .filter(([slug]) => slugs.has(slug))
            .map(([slug, values]) => [
                slug,
                values.filter(({ active_until: activeUntil }) => !activeUntil),
            ]),
    ),
});

const readBuiltIn = (
    record: AttioRecord,
    column: (typeof BUILT_IN_COLUMNS)[number],
): unknown => {
    switch (column) {
        case 'record_id':
            return record.id.record_id;
        case 'web_url':
            return record.web_url ?? null;
        case 'created_at':
            return record.created_at.slice(0, 10);
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
    if (column === 'created_at') {
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

/**
 * Reads matching records page by page, refusing past what one query can
 * read. A query that needs every record checks for one past the cap once its
 * first page comes back full, so it is refused after two calls, not twenty.
 */
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
    const slugs = new Set(
        request.columns.map((column) => parseAttioApiName(column).slug),
    );
    const fetchRecords = async ({
        limit,
        offset,
    }: {
        limit: number;
        offset: number;
    }) => {
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
        return data.map((record) => keepColumns(record, slugs));
    };
    const records: AttioRecord[] = [];
    const { hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: ATTIO_MAX_RECORDS,
        pageSize: ATTIO_PAGE_SIZE,
        maxPages: ATTIO_MAX_PAGES,
        fetchPage: async ({ limit, cursor }) => {
            const offset = cursor ? Number(cursor) : 0;
            const data = await fetchRecords({ limit, offset });
            const hasNextPage = data.length === limit;
            if (
                request.readsAllRecords &&
                requestedRows >= ATTIO_MAX_RECORDS &&
                offset === 0 &&
                hasNextPage
            ) {
                const pastTheCap = await fetchRecords({
                    limit: 1,
                    offset: ATTIO_MAX_RECORDS,
                });
                if (pastTheCap.length > 0) {
                    throw tooManyRowsError({
                        label: LABEL,
                        maxRows: ATTIO_MAX_RECORDS,
                    });
                }
            }
            records.push(...data);
            return {
                // Rows are only counted here; records keep the values
                rows: data.map(() => ({})),
                nextCursor: hasNextPage
                    ? String(offset + data.length)
                    : undefined,
            };
        },
    });
    return { records: records.slice(0, requestedRows), hasMoreRows };
};

/** Runs one Attio records query: one row per record, in pages of 500. */
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
    const { records, hasMoreRows } = await readRecords({
        object,
        request,
        requestedRows: limit,
        calls,
    });
    const rows = records.map((record) =>
        Object.fromEntries(
            columns.map((column) => [column, readColumn(record, column)]),
        ),
    );
    return {
        columns: columns.map(
            (name): LiveColumn => ({ name, type: toColumnType(name, rows) }),
        ),
        rows,
        hasMoreRows,
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
