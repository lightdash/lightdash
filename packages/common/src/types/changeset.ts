import { z } from 'zod';
import { FieldType, MetricType } from './field';

const ChangesetStatusSchema = z.enum(['draft', 'applied']);

export const ChangesetSchema = z.object({
    changesetUuid: z.string().uuid(),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdByUserUuid: z.string().uuid(),
    updatedByUserUuid: z.string().uuid(),
    projectUuid: z.string().uuid(),
    status: ChangesetStatusSchema,
    name: z.string().min(1),
});

export const ChangeBaseSchema = z
    .object({
        entityType: z.enum(['table', 'dimension', 'metric']),
        entityTableName: z.string().min(1),
        entityName: z.string().min(1),
    })
    .and(
        z.discriminatedUnion('type', [
            z.object({
                type: z.literal('create'),
                payload: z.discriminatedUnion('type', [
                    z.object({
                        type: z.literal('metric'),
                        value: z.object({
                            fieldType: z.literal(FieldType.METRIC),
                            type: z.nativeEnum(MetricType),
                            name: z.string(),
                            label: z.string(),
                            table: z.string(),
                            tableLabel: z.string(), // Table friendly name
                            sql: z.string(), // Templated sql
                            description: z.string().optional(),
                            hidden: z.boolean(),
                            compiledSql: z.string(),
                            tablesReferences: z.array(z.string()).optional(),
                            tablesRequiredAttributes: z
                                .record(
                                    z.string(),
                                    z.record(
                                        z.string(),
                                        z.string().or(z.array(z.string())),
                                    ),
                                )
                                .optional(),
                        }),
                    }),
                ]),
            }),
            z.object({
                type: z.literal('update'),
                payload: z.object({
                    patches: z.array(
                        z.object({
                            op: z.enum(['replace', 'add']),
                            path: z.string(),
                            value: z
                                .unknown()
                                .refine((value) => value !== undefined),
                        }),
                    ),
                }),
            }),
            z.object({
                type: z.literal('delete'),
                payload: z.object({}),
            }),
        ]),
    );

export type ChangeBase = z.infer<typeof ChangeBaseSchema>;

export const ChangeSchema = ChangeBaseSchema.and(
    z.object({
        changeUuid: z.string().uuid(),
        changesetUuid: z.string().uuid(),
        createdAt: z.date(),
        createdByUserUuid: z.string().uuid(),
        sourcePromptUuid: z.string().uuid().nullable(),
    }),
);

export const ChangesetWithChangesSchema = ChangesetSchema.extend({
    changes: z.array(ChangeSchema),
});

export type Changeset = z.infer<typeof ChangesetSchema>;
export type ChangesetWithChanges = z.infer<typeof ChangesetWithChangesSchema>;
export type Change = z.infer<typeof ChangeSchema>;

export type ApiChangesetsResponse = {
    status: 'ok';
    results: ChangesetWithChanges;
};

export type ApiGetChangeResponse = {
    status: 'ok';
    results: Change;
};

export type CreateChangeParams = Pick<
    Change,
    | 'createdByUserUuid'
    | 'sourcePromptUuid'
    | 'type'
    | 'entityName'
    | 'entityType'
    | 'entityTableName'
    | 'payload'
>;

// tsoa does not support z.infer schemas - https://github.com/lukeautry/tsoa/issues/1256
type ChangesetTSOACompat = Record<string, unknown>;
type ChangeTSOACompat = Record<string, unknown>;

export type ApiChangesetsResponseTSOACompat = {
    status: 'ok';
    results: ChangesetTSOACompat[];
};

export type ApiGetChangeResponseTSOACompat = {
    status: 'ok';
    results: ChangeTSOACompat;
};
