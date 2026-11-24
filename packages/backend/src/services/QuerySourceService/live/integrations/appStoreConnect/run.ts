import {
    DimensionType,
    getAppStoreConnectAppPath,
    type ApiConnectorType,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';

const LABEL = 'App Store Connect';

/** Lists return at most 200 records a call. */
const PAGE_SIZE = 200;
const MAX_PAGES = 25;

/**
 * The most rows one query reads: one fewer than every page it may fetch,
 * so reading them all detects truncation.
 */
export const APP_STORE_CONNECT_MAX_QUERY_ROWS = PAGE_SIZE * MAX_PAGES - 1;

export const APP_STORE_CONNECT_CALLS_PER_QUERY = MAX_PAGES;

type ResourceSpec = {
    fields: Partial<Record<string, DimensionType>>;
    filters: readonly string[];
    sorts: readonly string[];
    /** Sent when only the record ID is wanted, since an empty fieldset isn't documented. */
    cheapField: string;
};

export const APP_STORE_CONNECT_RESOURCES = {
    appStoreVersions: {
        fields: {
            versionString: DimensionType.STRING,
            platform: DimensionType.STRING,
            appVersionState: DimensionType.STRING,
            releaseType: DimensionType.STRING,
            reviewType: DimensionType.STRING,
            createdDate: DimensionType.TIMESTAMP,
            earliestReleaseDate: DimensionType.TIMESTAMP,
            downloadable: DimensionType.BOOLEAN,
        },
        filters: ['versionString', 'platform', 'appVersionState'],
        sorts: [],
        cheapField: 'versionString',
    },
    builds: {
        fields: {
            version: DimensionType.STRING,
            uploadedDate: DimensionType.TIMESTAMP,
            expirationDate: DimensionType.TIMESTAMP,
            expired: DimensionType.BOOLEAN,
            minOsVersion: DimensionType.STRING,
            processingState: DimensionType.STRING,
            buildAudienceType: DimensionType.STRING,
            usesNonExemptEncryption: DimensionType.BOOLEAN,
        },
        filters: [],
        sorts: [],
        cheapField: 'version',
    },
    customerReviews: {
        fields: {
            rating: DimensionType.NUMBER,
            title: DimensionType.STRING,
            body: DimensionType.STRING,
            reviewerNickname: DimensionType.STRING,
            territory: DimensionType.STRING,
            createdDate: DimensionType.TIMESTAMP,
        },
        filters: ['rating', 'territory'],
        sorts: ['rating', '-rating', 'createdDate', '-createdDate'],
        cheapField: 'rating',
    },
    reviewSubmissions: {
        fields: {
            platform: DimensionType.STRING,
            state: DimensionType.STRING,
            submittedDate: DimensionType.TIMESTAMP,
        },
        filters: ['platform', 'state'],
        sorts: [],
        cheapField: 'state',
    },
} as const satisfies Record<string, ResourceSpec>;

export type AppStoreConnectResource = keyof typeof APP_STORE_CONNECT_RESOURCES;

const RESOURCES = Object.keys(APP_STORE_CONNECT_RESOURCES) as [
    AppStoreConnectResource,
    ...AppStoreConnectResource[],
];

const getResource = (resource: AppStoreConnectResource): ResourceSpec =>
    APP_STORE_CONNECT_RESOURCES[resource];

const ID_COLUMN = 'id';

/** One App Store Connect list read, as compile writes it and agents send it. */
export const appStoreConnectRequestSchema = z
    .object({
        resource: z.enum(RESOURCES),
        fields: z.array(z.string()),
        filters: z.record(z.string(), z.array(z.string()).min(1)).optional(),
        sort: z.string().optional(),
        count: z.boolean().optional(),
        // Agents sometimes copy a limit in; the smaller limit wins
        rowLimit: z.number().int().positive().optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const spec = getResource(request.resource);
        const fail = (message: string) =>
            context.addIssue({ code: z.ZodIssueCode.custom, message });
        request.fields.forEach((field) => {
            if (field !== ID_COLUMN && !Object.hasOwn(spec.fields, field)) {
                fail(`${request.resource} has no field "${field}"`);
            }
        });
        if (!request.count && request.fields.length === 0) {
            fail('fields must name at least one field, or set count');
        }
        Object.entries(request.filters ?? {}).forEach(([filter, values]) => {
            if (!spec.filters.includes(filter)) {
                fail(
                    spec.filters.length === 0
                        ? `${request.resource} can't be filtered`
                        : `${request.resource} can't be filtered by "${filter}"; use one of: ${spec.filters.join(', ')}`,
                );
            }
            if (values.some((value) => value.includes(','))) {
                fail(
                    "App Store Connect can't filter on a value that contains a comma.",
                );
            }
        });
        if (request.sort !== undefined && !spec.sorts.includes(request.sort)) {
            fail(
                spec.sorts.length === 0
                    ? `${request.resource} can't be sorted by App Store Connect`
                    : `${request.resource} can't be sorted by "${request.sort}"; use one of: ${spec.sorts.join(', ')}`,
            );
        }
    });

export type AppStoreConnectRequest = z.infer<
    typeof appStoreConnectRequestSchema
>;

const listResponseSchema = z.object({
    data: z.array(
        z.object({
            id: z.string(),
            attributes: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    meta: z.object({
        paging: z.object({
            total: z.number(),
            nextCursor: z.string().optional(),
        }),
    }),
});
type ListRecord = z.infer<typeof listResponseSchema>['data'][number];

const toQuery = (
    request: AppStoreConnectRequest,
    attributes: string[],
): Record<string, string> => ({
    [`fields[${request.resource}]`]: (attributes.length > 0
        ? attributes
        : [getResource(request.resource).cheapField]
    ).join(','),
    ...Object.fromEntries(
        Object.entries(request.filters ?? {}).map(([filter, values]) => [
            `filter[${filter}]`,
            values.join(','),
        ]),
    ),
    ...(request.sort ? { sort: request.sort } : {}),
});

const toValue = (raw: unknown, type: DimensionType | undefined): unknown => {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (type === DimensionType.TIMESTAMP && typeof raw === 'string') {
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? raw : date.toISOString();
    }
    return raw;
};

const readRow = (
    record: ListRecord,
    fields: string[],
    spec: ResourceSpec,
): Record<string, unknown> =>
    Object.fromEntries(
        fields.map((field) => [
            field,
            field === ID_COLUMN
                ? record.id
                : toValue(record.attributes?.[field], spec.fields[field]),
        ]),
    );

/** How many records match, from the list's total: one call. */
const runCount = async (
    path: string,
    request: AppStoreConnectRequest,
    calls: LiveCalls,
): Promise<LiveRunResult> => {
    const { meta } = await calls.fetch(
        {
            method: 'GET',
            path,
            query: { ...toQuery(request, []), limit: '1' },
            body: undefined,
        },
        listResponseSchema,
    );
    return {
        columns: [{ name: 'total', type: DimensionType.NUMBER }],
        rows: [{ total: meta.paging.total }],
        hasMoreRows: false,
    };
};

/** Runs one App Store Connect request: a count, or a list paged by cursor. */
export const runAppStoreConnectQuery = async ({
    settings,
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.APP_STORE_CONNECT,
    AppStoreConnectRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, APP_STORE_CONNECT_MAX_QUERY_ROWS);
    const path = `${getAppStoreConnectAppPath(settings.appId)}${request.resource}`;
    if (request.count) {
        return runCount(path, request, calls);
    }
    const spec = getResource(request.resource);
    const { fields } = request;
    const query = toQuery(
        request,
        fields.filter((field) => field !== ID_COLUMN),
    );
    const requestedRows = Math.min(limit, request.rowLimit ?? limit);
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: APP_STORE_CONNECT_MAX_QUERY_ROWS,
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        fetchPage: async ({ limit: pageLimit, cursor }) => {
            const { data, meta } = await calls.fetch(
                {
                    method: 'GET',
                    path,
                    query: {
                        ...query,
                        limit: String(pageLimit),
                        ...(cursor ? { cursor } : {}),
                    },
                    body: undefined,
                },
                listResponseSchema,
            );
            return {
                rows: data.map((record) => readRow(record, fields, spec)),
                nextCursor: meta.paging.nextCursor || undefined,
            };
        },
    });
    return {
        columns: fields.map(
            (name): LiveColumn => ({
                name,
                type: spec.fields[name] ?? DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows,
    };
};
