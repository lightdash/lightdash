import {
    ApiConnectorType,
    DimensionType,
    getHubspotPipelinesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_PIPELINE_OBJECTS,
    type HubspotObject,
    type HubspotPipelineObject,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveRuntime,
} from '../../sdk';
import {
    HUBSPOT_BUILT_IN_COLUMNS,
    HUBSPOT_LABEL_SUFFIX,
    HUBSPOT_MAX_FILTERS,
    HUBSPOT_MAX_PAGES,
    HUBSPOT_MAX_ROWS,
    HUBSPOT_OBJECT_LABELS,
    HUBSPOT_PAGE_SIZE,
    HUBSPOT_PIPELINE_COLUMNS,
    isUnreadableObjectError,
    type HubspotBuiltInColumn,
    type HubspotPipelineColumn,
} from './api';
import { toHubspotPropertyName } from './model';

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

/** A column: a property or built-in field, or a property's labels (`dealstage:label`). */
const columnNameSchema = z
    .string()
    .refine(
        (name) =>
            isBuiltInColumn(name) ||
            PROPERTY_NAME.test(toHubspotPropertyName(name)),
        {
            message: `columns are HubSpot property names, a property name followed by ${HUBSPOT_LABEL_SUFFIX}, or ${HUBSPOT_BUILT_IN_COLUMNS.join(
                ', ',
            )}`,
        },
    );

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
            object: z.enum(HUBSPOT_OBJECTS),
            columns: z
                .array(
                    z
                        .object({
                            name: columnNameSchema,
                            type: z.enum(COLUMN_TYPES),
                            /** For a label column: labels by internal value. */
                            labels: z.record(z.string(), z.string()).optional(),
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
            object: z.enum(HUBSPOT_OBJECTS),
            filters: filtersSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('pipeline_stages'),
            /** Each object's pipelines are one call. */
            objects: z.array(z.enum(HUBSPOT_PIPELINE_OBJECTS)).min(1),
            columns: z
                .array(
                    z
                        .object({
                            name: z.enum(HUBSPOT_PIPELINE_COLUMNS),
                            type: z.enum(COLUMN_TYPES),
                        })
                        .strict(),
                )
                .min(1),
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
            // Leads only have HubSpot's newer name for it
            return object === 'leads' ? 'hs_createdate' : 'createdate';
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

/** A dropdown's labels; checkboxes hold several values, separated by semicolons. */
const toLabels = (raw: unknown, labels: Record<string, string>) =>
    raw === null || raw === undefined || raw === ''
        ? null
        : String(raw)
              .split(';')
              .map((value) =>
                  Object.hasOwn(labels, value) ? labels[value] : value,
              )
              .join(';');

const readColumn = (
    result: HubspotResult,
    {
        name,
        type,
        labels,
    }: {
        name: string;
        type: HubspotColumnType;
        labels?: Record<string, string>;
    },
): unknown => {
    if (name.endsWith(HUBSPOT_LABEL_SUFFIX)) {
        return toLabels(
            result.properties[toHubspotPropertyName(name)],
            labels ?? {},
        );
    }
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
    runtime: LiveRuntime,
): Promise<LiveRunResult> => {
    const { total } = await runtime.fetch(
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
    runtime: LiveRuntime,
): Promise<LiveRunResult> => {
    const properties = [
        ...new Set(
            request.columns
                .map(({ name }) => toHubspotPropertyName(name))
                .filter((name) => !isBuiltInColumn(name)),
        ),
    ];
    const results: HubspotResult[] = [];
    let after: string | undefined;
    let total = 0;
    for (let page = 0; page < HUBSPOT_MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await runtime.fetch(
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

const pipelinesSchema = z.object({
    results: z.array(
        z.object({
            id: z.string(),
            label: z.string(),
            displayOrder: z.number(),
            stages: z.array(
                z.object({
                    id: z.string(),
                    label: z.string(),
                    displayOrder: z.number(),
                    metadata: z.record(z.string(), z.unknown()).optional(),
                }),
            ),
        }),
    ),
});
type HubspotPipeline = z.infer<typeof pipelinesSchema>['results'][number];

/** A stage's metadata flag, which HubSpot sends as text. */
const toIsClosed = (metadata: Record<string, unknown>) => {
    if (metadata.isClosed !== undefined) {
        return String(metadata.isClosed) === 'true';
    }
    return metadata.ticketState === undefined
        ? null
        : String(metadata.ticketState) === 'CLOSED';
};

const toStageRows = (
    object: HubspotPipelineObject,
    pipelines: HubspotPipeline[],
): Record<HubspotPipelineColumn, unknown>[] =>
    [...pipelines]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .flatMap((pipeline) =>
            [...pipeline.stages]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((stage) => {
                    const metadata = stage.metadata ?? {};
                    const probability = toValue(metadata.probability, 'number');
                    return {
                        objectType: HUBSPOT_OBJECT_LABELS[object],
                        pipelineId: pipeline.id,
                        pipelineLabel: pipeline.label,
                        pipelineDisplayOrder: pipeline.displayOrder,
                        stageId: stage.id,
                        stageLabel: stage.label,
                        stageDisplayOrder: stage.displayOrder,
                        probability,
                        isClosed: toIsClosed(metadata),
                    };
                }),
        );

/**
 * Every pipeline and stage of the objects asked for, one call per object.
 * An object the token can't read is left out unless none can be read.
 */
const runPipelineStages = async (
    request: Extract<HubspotRequest, { kind: 'pipeline_stages' }>,
    limit: number,
    runtime: LiveRuntime,
): Promise<LiveRunResult> => {
    const objects = [...new Set(request.objects)];
    const lists = await Promise.allSettled(
        objects.map((object) =>
            runtime.fetch(
                {
                    method: 'GET',
                    path: getHubspotPipelinesPath(object),
                    body: undefined,
                },
                pipelinesSchema,
            ),
        ),
    );
    const rejected = lists.flatMap((list) =>
        list.status === 'rejected' ? [list.reason as unknown] : [],
    );
    const failure = rejected.find((error) => !isUnreadableObjectError(error));
    if (failure !== undefined || rejected.length === lists.length) {
        throw failure ?? rejected[0];
    }
    const stages = objects.flatMap((object, index) => {
        const list = lists[index];
        return list.status === 'fulfilled'
            ? toStageRows(object, list.value.results)
            : [];
    });
    const rows = stages
        .slice(0, limit)
        .map((stage) =>
            Object.fromEntries(
                request.columns.map(({ name }) => [name, stage[name]]),
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
        hasMoreRows: stages.length > rows.length,
    };
};

/** Runs one HubSpot search: the matching records, or how many there are. */
export const runHubspotQuery = async ({
    request,
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.HUBSPOT,
    HubspotRequest
>): Promise<LiveRunResult> => {
    if (request.kind === 'count') {
        return runCount(request.object, request.filters, runtime);
    }
    if (request.kind === 'pipeline_stages') {
        return runPipelineStages(request, limit, runtime);
    }
    assertMaxRows(limit, HUBSPOT_MAX_ROWS);
    return runRecords(request.object, request, limit, runtime);
};
