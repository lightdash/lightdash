import {
    Change,
    ChangeSchema,
    ChangesetWithChanges,
    ChangesetWithChangesSchema,
    CreateChangeParams,
    NotFoundError,
    ParseError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ChangesetsTableName,
    ChangesTableName,
    DbChange,
    DbChangeInsert,
    DbChangeInsertSchema,
    DbChangeSchema,
    EntityType,
} from '../database/entities/changesets';

type ChangesetModelArguments = {
    database: Knex;
};

export class ChangesetModel {
    private database: Knex;

    constructor(args: ChangesetModelArguments) {
        this.database = args.database;
    }

    async findActiveChangesetWithChangesByProjectUuid(
        projectUuid: string,
    ): Promise<ChangesetWithChanges | undefined> {
        // FIXME: NOTE: We are only returning the active changeset for now - active === latest
        const activeChangeset = await this.database(ChangesetsTableName)
            .select('*')
            .where('project_uuid', projectUuid)
            .orderBy('created_at', 'desc')
            .first();

        if (!activeChangeset) {
            return undefined;
        }

        const changes = await this.database(ChangesTableName)
            .select('*')
            .where('changeset_uuid', activeChangeset.changeset_uuid);

        const parsed = ChangesetWithChangesSchema.safeParse({
            changesetUuid: activeChangeset.changeset_uuid,
            projectUuid: activeChangeset.project_uuid,
            createdAt: activeChangeset.created_at,
            updatedAt: activeChangeset.updated_at,
            createdByUserUuid: activeChangeset.created_by_user_uuid,
            updatedByUserUuid: activeChangeset.updated_by_user_uuid,
            status: activeChangeset.status,
            name: activeChangeset.name,
            changes: changes.map((change) => ({
                changeUuid: change.change_uuid,
                changesetUuid: change.changeset_uuid,
                createdAt: change.created_at,
                createdByUserUuid: change.created_by_user_uuid,
                sourcePromptUuid: change.source_prompt_uuid,
                entityType: change.entity_type,
                entityTableName: change.entity_table_name,
                entityName: change.entity_name,
                type: change.type,
                payload: change.payload,
            })),
        });

        if (!parsed.success) {
            throw new ParseError('Failed to parse changeset', {
                activeChangeset,
            });
        }
        return parsed.data;
    }

    /**
     * Creates a change in the database, if no active changeset exists, it will be created.
     * @param params - The parameters for the change
     * @returns The created change
     */
    async createChange(
        projectUuid: string,
        change: CreateChangeParams,
    ): Promise<Change> {
        return this.database.transaction(async (trx) => {
            let activeChangeset = await trx(ChangesetsTableName)
                .where('project_uuid', projectUuid)
                .orderBy('created_at', 'desc')
                .first();

            // Create changeset if it doesn't exist
            if (!activeChangeset) {
                const [newChangeset] = await trx(ChangesetsTableName)
                    .insert({
                        project_uuid: projectUuid,
                        created_by_user_uuid: change.createdByUserUuid,
                        updated_by_user_uuid: change.createdByUserUuid,
                        status: 'draft',
                        // TODO: Handle name in the future - auto generated for now.
                        name: 'Auto-generated changeset',
                    })
                    .returning('*');

                activeChangeset = newChangeset;
            }

            const changeParsed = DbChangeInsertSchema.safeParse({
                changeset_uuid: activeChangeset.changeset_uuid,
                created_by_user_uuid: change.createdByUserUuid,
                source_prompt_uuid: change.sourcePromptUuid,
                type: change.type,
                entity_type: change.entityType,
                entity_table_name: change.entityTableName,
                entity_name: change.entityName,
                payload: change.payload,
            } satisfies DbChangeInsert);

            if (!changeParsed.success) {
                throw new ParseError('Failed to parse change', {
                    changeData: change,
                });
            }

            const [createdChange] = await trx(ChangesTableName)
                .insert(changeParsed.data)
                .returning('*');

            const parsedChange = ChangeSchema.safeParse({
                changeUuid: createdChange.change_uuid,
                changesetUuid: createdChange.changeset_uuid,
                createdAt: createdChange.created_at,
                createdByUserUuid: createdChange.created_by_user_uuid,
                sourcePromptUuid: createdChange.source_prompt_uuid,
                type: createdChange.type,
                entityType: createdChange.entity_type,
                entityTableName: createdChange.entity_table_name,
                entityName: createdChange.entity_name,
                payload: createdChange.payload,
            } satisfies Change);

            if (!parsedChange.success) {
                throw new ParseError('Failed to parse change', {
                    changeData: change,
                });
            }
            return parsedChange.data;
        });
    }
}
