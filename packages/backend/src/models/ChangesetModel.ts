import {
    ChangesetWithChanges,
    ChangesetWithChangesSchema,
    NotFoundError,
    ParseError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ChangesetsTableName,
    ChangesTableName,
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
}
