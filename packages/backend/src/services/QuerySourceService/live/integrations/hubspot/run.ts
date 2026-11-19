import {
    ApiConnectorType,
    DimensionType,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    type HubspotObject,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveScanResult,
} from '../../types';
import {
    HUBSPOT_BUILT_IN_COLUMNS,
    HUBSPOT_MAX_FILTERS,
    HUBSPOT_MAX_PAGES,
    HUBSPOT_MAX_ROWS,
    HUBSPOT_PAGE_SIZE,
    type HubspotBuiltInColumn,
} from './explores';

const PROPERTY_NAME = /^[a-z][a-z0-9_]*$/;

const isBuiltInColumn = (name: string): name is HubspotBuiltInColumn =>
    (HUBSPOT_BUILT_IN_COLUMNS as readonly string[]).includes(name);

/** A property's internal name, or a built-in field (id, createdAt, updatedAt). */
const nameSchema = z
    .string()
    .refine((name) => isBuiltInColumn(name) || PROPERTY_NAME.test(name), {
        message: `names are HubSpot property names (lowercase, digits, underscores) or ${HUBSPOT_BUILT_IN_COLUMNS.join(
            ', ',
        )}`,
    });

const COLUMN_TYPES = [
    'string',
    'number',
    'boolean',
    'date',
    'timestamp',
] as const;
type HubspotColumnType = (typeof COLUMN_TYPES)[number];

const filterSchema = z
    .object({
        propertyName: nameSchema,
        operator: z.enum([
            'EQ',
            'NEQ',
            'LT',
            'LTE',
            'GT',
            'GTE',
            'BETWEEN',
            'IN',
            'NOT_IN',
            'CONTAINS_TOKEN',
            'NOT_CONTAINS_TOKEN',
        ]),
        value: z.string().optional(),
        highValue: z.string().optional(),
        values: z.array(z.string()).min(1).optional(),
    })
    .strict();

export type HubspotFilter = z.infer<typeof filterSchema>;

const filtersSchema = z
    .array(filterSchema)
    .max(
        HUBSPOT_MAX_FILTERS,
        `HubSpot takes at most ${HUBSPOT_MAX_FILTERS} filters in one search`,
    );

/** One search, as compile writes it: records, or how many match. */
export const hubspotRequestSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('records'),
            columns: z
                .array(
                    z
                        .object({
                            name: nameSchema,
                            type: z.enum(COLUMN_TYPES),
                        })
                        .strict(),
                )
                .min(1),
            /** All must match. */
            filters: filtersSchema,
            /** HubSpot sorts by one property. */
            sort: z
                .object({
                    propertyName: nameSchema,
                    direction: z.enum(['ASCENDING', 'DESCENDING']),
                })
                .strict()
                .optional(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('count'),
            filters: filtersSchema,
        })
        .strict(),
]);

export type HubspotRequest = z.infer<typeof hubspotRequestSchema>;

const resultSchema = z.object({
    id: z.string(),
    properties: z.record(z.string(), z.unknown()),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
});
type HubspotResult = z.infer<typeof resultSchema>;

const searchResponseSchema = z.object({
    total: z.number(),
    results: z.array(resultSchema),
    paging: z
        .object({ next: z.object({ after: z.string() }).optional() })
        .optional(),
});

/** The property a built-in field filters and sorts by, per object. */
const toPropertyName = (name: string, object: HubspotObject): string => {
    switch (name) {
        case 'id':
            return 'hs_object_id';
        case 'createdAt':
            return 'createdate';
        case 'updatedAt':
            // Contacts kept their original name for it
            return object === 'contacts'
                ? 'lastmodifieddate'
                : 'hs_lastmodifieddate';
        default:
            return name;
    }
};

/** Search filters with built-in fields named as properties; none sends no group. */
const toFilterGroups = (filters: HubspotFilter[], object: HubspotObject) =>
    filters.length === 0
        ? {}
        : {
              filterGroups: [
                  {
                      filters: filters.map((filter) => ({
                          ...filter,
                          propertyName: toPropertyName(
                              filter.propertyName,
                              object,
                          ),
                      })),
                  },
              ],
          };

/** HubSpot sends every property value as text. */
const toValue = (raw: unknown, type: HubspotColumnType): unknown => {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }
    switch (type) {
        case 'number': {
            const number = Number(raw);
            return Number.isFinite(number) ? number : null;
        }
        case 'boolean':
            return String(raw) === 'true';
        case 'date':
            return String(raw).slice(0, 10);
        default:
            return String(raw);
    }
};

const readColumn = (
    result: HubspotResult,
    { name, type }: { name: string; type: HubspotColumnType },
): unknown => {
    switch (name) {
        case 'id':
            return result.id;
        case 'createdAt':
            return toValue(result.createdAt, type);
        case 'updatedAt':
            return toValue(result.updatedAt, type);
        default:
            return toValue(result.properties[name], type);
    }
};

const DIMENSION_TYPES: Record<HubspotColumnType, DimensionType> = {
    string: DimensionType.STRING,
    number: DimensionType.NUMBER,
    boolean: DimensionType.BOOLEAN,
    date: DimensionType.DATE,
    timestamp: DimensionType.TIMESTAMP,
};

/** How many records match, from the search's total: one call. */
const runCount = async (
    object: HubspotObject,
    filters: HubspotFilter[],
    calls: LiveCalls,
): Promise<LiveRunResult> => {
    const { total } = await calls.fetch(
        {
            method: 'POST',
            path: getHubspotSearchPath(object),
            body: {
                ...toFilterGroups(filters, object),
                properties: ['hs_object_id'],
                limit: 1,
            },
        },
        searchResponseSchema,
    );
    return {
        columns: [{ name: 'total', type: DimensionType.NUMBER }],
        rows: [{ total }],
        hasMoreRows: false,
    };
};

/**
 * Reads only the pages the limit needs, in pages of up to 200. The search's
 * total says whether more records match, so no page is read for that alone.
 */
const runRecords = async (
    object: HubspotObject,
    request: Extract<HubspotRequest, { kind: 'records' }>,
    limit: number,
    calls: LiveCalls,
): Promise<LiveRunResult> => {
    const properties = request.columns
        .map(({ name }) => name)
        .filter((name) => !isBuiltInColumn(name));
    const results: HubspotResult[] = [];
    let after: string | undefined;
    let total = 0;
    for (let page = 0; page < HUBSPOT_MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await calls.fetch(
            {
                method: 'POST',
                path: getHubspotSearchPath(object),
                body: {
                    ...toFilterGroups(request.filters, object),
                    ...(request.sort
                        ? {
                              sorts: [
                                  {
                                      propertyName: toPropertyName(
                                          request.sort.propertyName,
                                          object,
                                      ),
                                      direction: request.sort.direction,
                                  },
                              ],
                          }
                        : {}),
                    // Without a list HubSpot sends its default properties
                    properties:
                        properties.length > 0 ? properties : ['hs_object_id'],
                    limit: Math.min(HUBSPOT_PAGE_SIZE, limit - results.length),
                    ...(after ? { after } : {}),
                },
            },
            searchResponseSchema,
        );
        results.push(...response.results);
        total = response.total;
        after = response.paging?.next?.after;
        if (!after || results.length >= limit) {
            break;
        }
    }
    const rows = results
        .slice(0, limit)
        .map((result) =>
            Object.fromEntries(
                request.columns.map((column) => [
                    column.name,
                    readColumn(result, column),
                ]),
            ),
        );
    return {
        columns: request.columns.map(
            ({ name, type }): LiveColumn => ({
                name,
                type: DIMENSION_TYPES[type],
            }),
        ),
        rows,
        hasMoreRows: total > rows.length || after !== undefined,
    };
};

/** Runs one HubSpot search: the matching records, or how many there are. */
export const runHubspotQuery = async ({
    settings: { object },
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.HUBSPOT,
    HubspotRequest
>): Promise<LiveRunResult> => {
    if (request.kind === 'count') {
        return runCount(object, request.filters, calls);
    }
    assertMaxRows(limit, HUBSPOT_MAX_ROWS);
    return runRecords(object, request, limit, calls);
};

/** Reads the object's properties, which become its fields. */
export const scanHubspotProperties = async ({
    settings: { object },
    calls,
}: {
    settings: { object: HubspotObject };
    calls: LiveCalls;
}): Promise<LiveScanResult> => ({
    hubspotProperties: await calls.fetch(
        {
            method: 'GET',
            path: getHubspotPropertiesPath(object),
            body: undefined,
        },
        z.unknown(),
    ),
});
