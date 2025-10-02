import { z } from 'zod';

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

export const ChangeSchema = z
    .object({
        changeUuid: z.string().uuid(),
        changesetUuid: z.string().uuid(),
        createdAt: z.date(),
        createdByUserUuid: z.string().uuid(),
        sourcePromptUuid: z.string().uuid().nullable(),
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
                        // TODO: add metric schema
                        value: z.unknown(),
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

export type ApiChangesetsResponseTSOACompat = {
    status: 'ok';
    results: ChangesetTSOACompat[];
};
