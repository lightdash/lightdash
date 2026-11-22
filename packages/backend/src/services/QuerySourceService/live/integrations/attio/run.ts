import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_WORKSPACE_MEMBERS_PATH,
    DimensionType,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveScanResult,
} from '../../types';
import { parseAttioApiName, type AttioValueProperty } from './attributes';
import { AttioObjectAccessError } from './errors';
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
    'active_from',
    'member_name',
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
        /** The standard object to read, by its slug. */
        object: z.enum(ATTIO_OBJECTS),
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

/** Workspace member names by id, for owner name fields. */
type MemberNames = ReadonlyMap<string, string>;

const readValue = (
    value: Record<string, unknown>,
    property: AttioValueProperty | null,
    memberNames: MemberNames,
): unknown => {
    switch (property) {
        case 'member_name':
            return typeof value.referenced_actor_id === 'string'
                ? (memberNames.get(value.referenced_actor_id) ?? null)
                : null;
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
const readAttribute = (
    record: AttioRecord,
    column: string,
    memberNames: MemberNames,
): unknown => {
    const { slug, property } = parseAttioApiName(column);
    const values = (record.values[slug] ?? [])
        .filter(({ active_until: activeUntil }) => !activeUntil)
        .map((value) => readValue(value, property, memberNames))
        .filter((value) => value !== null && value !== undefined);
    if (values.length === 0) {
        return null;
    }
    return values.every((value) => typeof value === 'string')
        ? values.join(', ')
        : values[0];
};

const readColumn = (
    record: AttioRecord,
    column: string,
    memberNames: MemberNames,
): unknown =>
    (BUILT_IN_COLUMNS as readonly string[]).includes(column)
        ? readBuiltIn(record, column as (typeof BUILT_IN_COLUMNS)[number])
        : readAttribute(record, column, memberNames);

const membersResponseSchema = z.object({
    data: z.array(
        z.object({
            id: z.object({ workspace_member_id: z.string() }),
            first_name: z.string().nullable().optional(),
            last_name: z.string().nullable().optional(),
        }),
    ),
});

/**
 * Names of the workspace's members, read once when an owner name is
 * selected. A token without the user_management:read scope reads none, so
 * names are empty and the query still runs.
 */
const readMemberNames = async (
    columns: string[],
    calls: LiveCalls,
): Promise<MemberNames> => {
    const needed = columns.some(
        (column) => parseAttioApiName(column).property === 'member_name',
    );
    if (!needed) {
        return new Map();
    }
    try {
        const { data } = await calls.fetch(
            {
                method: 'GET',
                path: ATTIO_WORKSPACE_MEMBERS_PATH,
                body: undefined,
            },
            membersResponseSchema,
        );
        return new Map(
            data.flatMap(({ id, first_name: first, last_name: last }) => {
                const name = [first, last]
                    .filter((part) => part?.trim())
                    .join(' ');
                return name ? [[id.workspace_member_id, name]] : [];
            }),
        );
    } catch (error) {
        if (error instanceof AttioObjectAccessError) {
            return new Map();
        }
        throw error;
    }
};

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

/** Runs one Attio records query: one row per record, in pages of 500. */
export const runAttioQuery = async ({
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
        object: request.object,
        request,
        requestedRows: limit,
        calls,
    });
    const memberNames = await readMemberNames(columns, calls);
    const rows = records.map((record) =>
        Object.fromEntries(
            columns.map((column) => [
                column,
                readColumn(record, column, memberNames),
            ]),
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

/**
 * Reads each object's attributes, which become its explore's fields. An
 * object the token can't read, or the workspace lacks, keeps its built-in
 * fields; any other failed call, such as a throttled one, fails the scan so
 * the last good scan stays.
 */
export const scanAttioAttributes = async ({
    calls,
}: {
    calls: LiveCalls;
}): Promise<LiveScanResult> => {
    const results = await Promise.allSettled(
        ATTIO_OBJECTS.map((object) =>
            calls.fetch(
                {
                    method: 'GET',
                    path: getAttioAttributesPath(object),
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
        (error) => !(error instanceof AttioObjectAccessError),
    );
    if (unexpected !== undefined) {
        throw unexpected;
    }
    const read = ATTIO_OBJECTS.flatMap((object, index) => {
        const result = results[index];
        return result.status === 'fulfilled' ? [[object, result.value]] : [];
    });
    if (read.length === 0) {
        throw failed[0];
    }
    return { attioAttributes: Object.fromEntries(read) };
};
