import {
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
        params: CreateChangeParams,
    ): Promise<ChangesetWithChanges['changes'][number]> {
        return this.database.transaction(async (trx) => {
            let activeChangeset = await trx(ChangesetsTableName)
                .where('project_uuid', params.projectUuid)
                .orderBy('created_at', 'desc')
                .first();

            // Create changeset if it doesn't exist
            if (!activeChangeset) {
                const [newChangeset] = await trx(ChangesetsTableName)
                    .insert({
                        project_uuid: params.projectUuid,
                        created_by_user_uuid: params.createdByUserUuid,
                        updated_by_user_uuid: params.createdByUserUuid,
                        status: 'draft',
                        // TODO: Handle name in the future - auto generated for now.
                        name: 'Auto-generated changeset',
                    })
                    .returning('*');

                activeChangeset = newChangeset;
            }

            const changeParsed = DbChangeInsertSchema.safeParse({
                changeset_uuid: activeChangeset.changeset_uuid,
                created_by_user_uuid: params.createdByUserUuid,
                source_prompt_uuid: params.sourcePromptUuid,
                type: params.type,
                entity_type: params.entityType,
                entity_explore_uuid: params.entityExploreUuid,
                entity_name: params.entityName,
                payload: params.payload,
            });

            if (!changeParsed.success) {
                throw new ParseError('Failed to parse change', {
                    changeData: params,
                });
            }

            const [change] = await trx(ChangesTableName)
                .insert(changeParsed.data)
                .returning('*');

            const parsedChange = ChangeSchema.safeParse({
                changeUuid: change.change_uuid,
                changesetUuid: change.changeset_uuid,
                createdAt: change.created_at,
                createdByUserUuid: change.created_by_user_uuid,
                sourcePromptUuid: change.source_prompt_uuid,
                type: change.type,
                entityType: change.entity_type,
                entityTableName: change.entity_table_name,
                entityName: change.entity_name,
                payload: change.payload,
            });
            if (!parsedChange.success) {
                throw new ParseError('Failed to parse change', {
                    changeData: change,
                });
            }
            return parsedChange.data;
        });
    }
}
