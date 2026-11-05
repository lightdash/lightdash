import { type PreAggregateDef } from '@lightdash/common';
import { type Knex } from 'knex';
import { CachedExploreTableName } from '../database/entities/projects';
import { PreAggregateDefinitionsTableName } from '../ee/database/entities/preAggregates';

export class AgentConnectionApprovalReadModel {
    constructor(private readonly deps: { database: Knex }) {}

    async getScheduledRefreshProjectUuids(
        projectUuids: string[],
    ): Promise<string[]> {
        const { database } = this.deps;
        const [stored, cached] = await Promise.all([
            database(PreAggregateDefinitionsTableName)
                .distinct('project_uuid')
                .whereIn('project_uuid', projectUuids)
                .whereNotNull('refresh_cron'),
            database(CachedExploreTableName)
                .select<
                    {
                        project_uuid: string;
                        definitions: PreAggregateDef[] | null;
                    }[]
                >(
                    'project_uuid',
                    database.raw("explore->'preAggregates' as definitions"),
                )
                .whereIn('project_uuid', projectUuids),
        ]);
        return [
            ...new Set([
                ...stored.map((row) => row.project_uuid),
                ...cached
                    .filter((row) =>
                        row.definitions?.some(
                            (definition) => definition.refresh?.cron != null,
                        ),
                    )
                    .map((row) => row.project_uuid),
            ]),
        ];
    }
}
