import {
    AIRTABLE_TABLE_ID,
    DimensionType,
    getAirtableRecordsPath,
    type ApiConnectorType,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    readRowsWithinCap,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveRuntime,
} from '../../sdk';
import {
    AIRTABLE_CREATED_TIME,
    AIRTABLE_RECORD_COLUMNS,
    AIRTABLE_RECORD_ID,
    AIRTABLE_TABLE_COLUMNS,
    readAirtableBase,
    type AirtableTable,
} from './model';

const LABEL = 'Airtable';

/** The most records one list call returns. */
export const AIRTABLE_PAGE_SIZE = 100;
export const AIRTABLE_MAX_PAGES = 50;
/** One fewer than the pages hold, so reading every page detects a cut-off result. */
export const AIRTABLE_MAX_QUERY_ROWS =
    AIRTABLE_PAGE_SIZE * AIRTABLE_MAX_PAGES - 1;

/** One read of a table's records, as compile writes it and agents send it. */
const recordsRequestSchema = z
    .object({
        read: z.literal('records'),
        /** The table's id, as its explore names it. */
        table: z
            .string()
            .regex(AIRTABLE_TABLE_ID, 'Use a table id, like tblXXXXXXXXXXXXXX'),
        /** Field names as the table shows them, plus $id and $createdTime. */
        fields: z.array(z.string().min(1)).min(1),
        /** An Airtable formula; records where it is true are returned. */
        filterByFormula: z.string().min(1).optional(),
        /** Field names; $id and $createdTime can't be sorted by Airtable. */
        sort: z
            .array(
                z
                    .object({
                        field: z.string().min(1),
                        direction: z.enum(['asc', 'desc']),
                    })
                    .strict(),
            )
            .optional(),
        /** Checkbox fields, which Airtable leaves out when unticked; they read as false. */
        checkboxes: z.array(z.string().min(1)).optional(),
        /** A view's name or id: only its records, in its order. */
        view: z.string().min(1).optional(),
        // Agents sometimes copy a limit in; the smaller limit wins
        maxRecords: z.number().int().positive().optional(),
    })
    .strict();

/** The base's tables, one row each, from the base schema. */
const tablesRequestSchema = z
    .object({
        read: z.literal('tables'),
        /** Keys of AIRTABLE_TABLE_COLUMNS. */
        fields: z
            .array(
                z.enum(
                    Object.values(AIRTABLE_TABLE_COLUMNS) as [
                        string,
                        ...string[],
                    ],
                ),
            )
            .min(1),
    })
    .strict();

export const airtableRequestSchema = z
    .discriminatedUnion('read', [recordsRequestSchema, tablesRequestSchema])
    .superRefine((request, context) => {
        if (request.read !== 'records') return;
        const unsortable = (request.sort ?? []).find(({ field }) =>
            AIRTABLE_RECORD_COLUMNS.includes(field),
        );
        if (unsortable) {
            context.addIssue({
                code: 'custom',
                message: `Airtable can't sort by ${unsortable.field}; sort by a field of the table`,
            });
        }
    });

export type AirtableRequest = z.infer<typeof airtableRequestSchema>;
export type AirtableRecordsRequest = z.infer<typeof recordsRequestSchema>;

/** The list call's query string for one request, without paging. */
export const toAirtableQuery = (
    request: AirtableRecordsRequest,
): Record<string, string> => {
    const fields = request.fields.filter(
        (field) => !AIRTABLE_RECORD_COLUMNS.includes(field),
    );
    return {
        // With only $id or $createdTime, Airtable sends every field
        ...Object.fromEntries(
            fields.map((field, index) => [`fields[${index}]`, field]),
        ),
        ...(request.filterByFormula
            ? { filterByFormula: request.filterByFormula }
            : {}),
        ...Object.fromEntries(
            (request.sort ?? []).flatMap(({ field, direction }, index) => [
                [`sort[${index}][field]`, field],
                [`sort[${index}][direction]`, direction],
            ]),
        ),
        ...(request.view ? { view: request.view } : {}),
    };
};

const recordsSchema = z.object({
    records: z.array(
        z.object({
            id: z.string(),
            createdTime: z.string(),
            fields: z.record(z.string(), z.unknown()),
        }),
    ),
    offset: z.string().optional(),
});

type AirtableRecord = z.infer<typeof recordsSchema>['records'][number];

/** People, attachments, barcodes and buttons read as the text they show. */
const toText = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        const items = value.map(toText).filter((item) => item != null);
        return items.length > 0 ? items.join(', ') : null;
    }
    const object = value as Record<string, unknown>;
    // A formula that failed, e.g. { specialValue: 'NaN' } or { error: '#ERROR!' }
    if ('error' in object || 'specialValue' in object) return null;
    for (const key of ['name', 'email', 'filename', 'text', 'label', 'url']) {
        if (typeof object[key] === 'string') return object[key];
    }
    return JSON.stringify(value);
};

const toCell = (
    record: AirtableRecord,
    field: string,
    checkboxes: Set<string>,
) => {
    if (field === AIRTABLE_RECORD_ID) return record.id;
    if (field === AIRTABLE_CREATED_TIME) return record.createdTime;
    if (checkboxes.has(field)) return record.fields[field] === true;
    return toText(record.fields[field] ?? null) ?? null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A column's type, from the first value that says. */
const toColumnType = (
    rows: Record<string, unknown>[],
    column: string,
): DimensionType => {
    if (column === AIRTABLE_CREATED_TIME) return DimensionType.TIMESTAMP;
    const value = rows.find((row) => row[column] != null)?.[column];
    if (typeof value === 'number') return DimensionType.NUMBER;
    if (typeof value === 'boolean') return DimensionType.BOOLEAN;
    if (typeof value === 'string' && ISO_DATE.test(value)) {
        return DimensionType.DATE;
    }
    if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
        return DimensionType.TIMESTAMP;
    }
    return DimensionType.STRING;
};

/** One table as a row of the tables explore. */
const toTableRow = (table: AirtableTable): Record<string, unknown> => ({
    [AIRTABLE_TABLE_COLUMNS.id]: table.id,
    [AIRTABLE_TABLE_COLUMNS.name]: table.name,
    [AIRTABLE_TABLE_COLUMNS.description]: table.description ?? null,
    [AIRTABLE_TABLE_COLUMNS.primaryField]:
        table.fields.find(({ id }) => id === table.primaryFieldId)?.name ??
        null,
    [AIRTABLE_TABLE_COLUMNS.fieldCount]: table.fields.length,
});

/** Lists the base's tables with one call to the base schema. */
const runAirtableTables = async ({
    settings,
    fields,
    limit,
    runtime,
}: {
    settings: { baseId: string };
    fields: string[];
    limit: number;
    runtime: LiveRuntime;
}): Promise<LiveRunResult> => {
    const tables = await readAirtableBase({ settings, runtime });
    const rows = tables
        .slice(0, limit)
        .map(toTableRow)
        .map((row) =>
            Object.fromEntries(
                fields.map((field) => [field, row[field] ?? null]),
            ),
        );
    return {
        columns: fields.map(
            (name): LiveColumn => ({
                name,
                type:
                    name === AIRTABLE_TABLE_COLUMNS.fieldCount
                        ? DimensionType.NUMBER
                        : DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows: tables.length > limit,
    };
};

/**
 * Reads one table of the base, a page of up to 100 records at a time, or
 * lists the base's tables.
 */
export const runAirtableQuery = async ({
    settings,
    request,
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.AIRTABLE,
    AirtableRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, AIRTABLE_MAX_QUERY_ROWS);
    if (request.read === 'tables') {
        return runAirtableTables({
            settings,
            fields: request.fields,
            limit,
            runtime,
        });
    }
    const query = toAirtableQuery(request);
    const checkboxes = new Set(request.checkboxes ?? []);
    const requestedRows = Math.min(limit, request.maxRecords ?? limit);
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: AIRTABLE_MAX_QUERY_ROWS,
        pageSize: AIRTABLE_PAGE_SIZE,
        maxPages: AIRTABLE_MAX_PAGES,
        fetchPage: async ({ limit: pageLimit, cursor }) => {
            const page = await runtime.fetch(
                {
                    method: 'GET',
                    path: getAirtableRecordsPath(
                        settings.baseId,
                        request.table,
                    ),
                    query: {
                        ...query,
                        pageSize: String(pageLimit),
                        ...(cursor ? { offset: cursor } : {}),
                    },
                    body: undefined,
                },
                recordsSchema,
            );
            return {
                rows: page.records.map((record) =>
                    Object.fromEntries(
                        request.fields.map((field) => [
                            field,
                            toCell(record, field, checkboxes),
                        ]),
                    ),
                ),
                nextCursor: page.offset,
            };
        },
    });
    return {
        columns: request.fields.map(
            (name): LiveColumn => ({ name, type: toColumnType(rows, name) }),
        ),
        rows,
        hasMoreRows,
    };
};
