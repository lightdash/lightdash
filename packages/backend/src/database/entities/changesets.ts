import { Knex } from 'knex';
import { z } from 'zod';

export const ChangesetsTableName = 'changesets';
export const ChangesTableName = 'changes';

export const ChangesetStatusSchema = z.enum(['draft', 'applied']);
export type ChangesetStatus = z.infer<typeof ChangesetStatusSchema>;

export const ChangeTypeSchema = z.enum(['create', 'update', 'delete']);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const EntityTypeSchema = z.enum(['table', 'dimension', 'metric']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const DbChangesetSchema = z.object({
    changeset_uuid: z.string().uuid(),
    created_at: z.date(),
    updated_at: z.date(),
    created_by_user_uuid: z.string().uuid(),
    updated_by_user_uuid: z.string().uuid(),
    project_uuid: z.string().uuid(),
    status: ChangesetStatusSchema,
    name: z.string().min(1),
});

export type DbChangeset = z.infer<typeof DbChangesetSchema>;

export const DbChangesetInsertSchema = DbChangesetSchema.pick({
    created_by_user_uuid: true,
    updated_by_user_uuid: true,
    project_uuid: true,
    status: true,
    name: true,
});

type DbChangesetInsert = z.infer<typeof DbChangesetInsertSchema>;

export const DbChangesetUpdateSchema = DbChangesetSchema.pick({
    updated_by_user_uuid: true,
    updated_at: true,
    status: true,
    name: true,
})
    .partial()
    .required({ updated_by_user_uuid: true });

type DbChangesetUpdate = z.infer<typeof DbChangesetUpdateSchema>;

export type ChangesetsTable = Knex.CompositeTableType<
    DbChangeset,
    DbChangesetInsert,
    DbChangesetUpdate
>;

export const DbChangeSchema = z.object({
    change_uuid: z.string().uuid(),
    changeset_uuid: z.string().uuid(),
    created_at: z.date(),
    created_by_user_uuid: z.string().uuid(),
    source_prompt_uuid: z.string().uuid().nullable(),
    entity_type: EntityTypeSchema,
    entity_table_name: z.string().min(1),
    entity_name: z.string().min(1),
    type: ChangeTypeSchema,
    payload: z.union([
        z.discriminatedUnion('type', [
            z.object({
                type: z.literal('metric'),
                // TODO: add metric schema
                value: z.unknown(),
            }),
        ]),
        z.object({
            patches: z.array(
                z.object({
                    op: z.enum(['replace', 'add']),
                    path: z.string(),
                    value: z.unknown().refine((value) => value !== undefined),
                }),
            ),
        }),
    ]),
});

export type DbChange = z.infer<typeof DbChangeSchema>;

export const DbChangeInsertSchema = DbChangeSchema.pick({
    changeset_uuid: true,
    created_by_user_uuid: true,
    source_prompt_uuid: true,
    type: true,
    entity_type: true,
    entity_table_name: true,
    entity_name: true,
    payload: true,
});

export type DbChangeInsert = z.infer<typeof DbChangeInsertSchema>;

export type ChangesTable = Knex.CompositeTableType<DbChange, DbChangeInsert>;
