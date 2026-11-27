import { type HydraCustomObject } from '@lightdash/common';
import { z } from 'zod';
import { addDays, createRandom, toSeed } from './fake/data';

/**
 * Hydra's custom objects, as its vendor side keeps them: the objects a
 * source declares in `customObjects`, listed with their fields, and records
 * seeded from the sign-in token that a report groups and counts.
 */

/** Records seeded per object when the object doesn't say. */
export const HYDRA_DEFAULT_RECORD_COUNT = 50;
/** Days back a seeded date field reaches, ending today. */
const DATE_DAYS = 365;
/** Distinct values a seeded text field takes. */
const TEXT_VALUES = 5;
/** The field every record has, holding its id. */
export const HYDRA_RECORD_ID_FIELD = 'id';
/** The one total an object report gives. */
export const HYDRA_RECORD_COUNT = 'record_count';

/** How Hydra lists a source's objects. */
export const hydraObjectsResponseSchema = z.object({
    objects: z.array(
        z.object({
            id: z.string(),
            label: z.string(),
            recordIdField: z.string(),
            fields: z.array(
                z.object({
                    id: z.string(),
                    label: z.string(),
                    type: z.enum(['string', 'number', 'date', 'boolean']),
                    internal: z.boolean(),
                }),
            ),
        }),
    ),
});

export type HydraObjectsResponse = z.infer<typeof hydraObjectsResponseSchema>;

/** The objects a source declares, with the record id field each has. */
export const listHydraObjects = (
    objects: HydraCustomObject[],
): HydraObjectsResponse => ({
    objects: objects.map((object) => ({
        id: object.id,
        label: object.label,
        recordIdField: HYDRA_RECORD_ID_FIELD,
        fields: [
            {
                id: HYDRA_RECORD_ID_FIELD,
                label: 'ID',
                type: 'string' as const,
                internal: false,
            },
            ...object.fields
                .filter(({ id }) => id !== HYDRA_RECORD_ID_FIELD)
                .map((field) => ({
                    ...field,
                    internal: field.internal ?? false,
                })),
        ],
    })),
});

/** One report on one object, as compile writes it and agents send it. */
export const hydraObjectReportSchema = z
    .object({
        object: z.string().min(1),
        dimensions: z.array(z.string()).default([]),
        metrics: z.array(z.literal(HYDRA_RECORD_COUNT)).default([]),
        filters: z
            .array(
                z
                    .object({
                        field: z.string(),
                        operator: z.enum(['in', 'not_in']),
                        values: z.array(z.string()).min(1),
                    })
                    .strict(),
            )
            .default([]),
        orderBy: z
            .array(
                z
                    .object({
                        field: z.string(),
                        descending: z.boolean().default(false),
                    })
                    .strict(),
            )
            .default([]),
        limit: z.number().int().positive().optional(),
    })
    .strict()
    .refine(
        ({ dimensions, metrics }) => dimensions.length + metrics.length > 0,
        'Ask for at least one dimension or metric',
    );

export type HydraObjectReportRequest = z.infer<typeof hydraObjectReportSchema>;

type HydraRecord = Record<string, string | number>;

/** An object's records for one token; the same token always seeds the same ones. */
export const buildHydraObjectRecords = ({
    token,
    object,
    today,
}: {
    token: string;
    object: HydraCustomObject;
    today: string;
}): HydraRecord[] => {
    const random = createRandom(toSeed(`${token}:${object.id}`));
    return Array.from(
        { length: object.recordCount ?? HYDRA_DEFAULT_RECORD_COUNT },
        (_, index) =>
            Object.fromEntries([
                [
                    HYDRA_RECORD_ID_FIELD,
                    `${object.id.toLowerCase()}_${String(index + 1).padStart(4, '0')}`,
                ],
                ...object.fields
                    .filter(({ id }) => id !== HYDRA_RECORD_ID_FIELD)
                    .map((field): [string, string | number] => {
                        switch (field.type) {
                            case 'number':
                                return [field.id, Math.floor(random() * 1_000)];
                            case 'date':
                                return [
                                    field.id,
                                    addDays(
                                        today,
                                        -Math.floor(random() * DATE_DAYS),
                                    ),
                                ];
                            case 'boolean':
                                return [
                                    field.id,
                                    random() < 0.5 ? 'true' : 'false',
                                ];
                            default:
                                return [
                                    field.id,
                                    `${field.id.toLowerCase()}_${
                                        1 + Math.floor(random() * TEXT_VALUES)
                                    }`,
                                ];
                        }
                    }),
            ]),
    );
};

const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b));

/**
 * Runs a report on one object the way Hydra's API would: filters, groups,
 * counts and sorts every matching record. Returns every group.
 */
export const runHydraObjectReport = (
    records: HydraRecord[],
    request: HydraObjectReportRequest,
): HydraRecord[] => {
    const read = (record: HydraRecord, field: string) =>
        String(record[field] ?? '');
    const groups = new Map<string, number>();
    records
        .filter((record) =>
            request.filters.every(({ field, operator, values }) =>
                operator === 'in'
                    ? values.includes(read(record, field))
                    : !values.includes(read(record, field)),
            ),
        )
        .forEach((record) => {
            const key = JSON.stringify(
                request.dimensions.map((field) => record[field] ?? null),
            );
            groups.set(key, (groups.get(key) ?? 0) + 1);
        });
    if (request.dimensions.length === 0 && groups.size === 0) {
        groups.set('[]', 0);
    }
    const rows = [...groups.entries()].map(([key, count]) => {
        const values = JSON.parse(key) as (string | number)[];
        return {
            ...Object.fromEntries(
                request.dimensions.map((field, index) => [
                    field,
                    values[index],
                ]),
            ),
            ...Object.fromEntries(
                request.metrics.map((metric) => [metric, count]),
            ),
        };
    });
    const orderBy =
        request.orderBy.length > 0
            ? request.orderBy
            : [
                  ...request.metrics
                      .slice(0, 1)
                      .map((field) => ({ field, descending: true })),
                  ...request.dimensions.map((field) => ({
                      field,
                      descending: false,
                  })),
              ];
    return rows.sort((a, b) => {
        for (const { field, descending } of orderBy) {
            const order = compare(a[field] ?? '', b[field] ?? '');
            if (order !== 0) return descending ? -order : order;
        }
        return 0;
    });
};
