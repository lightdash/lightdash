import {
    HOMEPAGE_RECOMMENDED_ACTION_SCOPES,
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type SkippableHomepageRecommendedActionKey,
    type UUID,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    HomepageRecommendedActionSkipsTableName,
    type HomepageRecommendedActionSkipsTable,
} from '../database/entities/homepageRecommendedActionSkips';

type HomepageRecommendedActionSkipScope = {
    organizationUuid: UUID;
    projectUuid: UUID | null;
};

const ORGANIZATION_ACTION_KEYS =
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS.filter(
        (key) => HOMEPAGE_RECOMMENDED_ACTION_SCOPES[key] === 'organization',
    );
const PROJECT_ACTION_KEYS = SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS.filter(
    (key) => HOMEPAGE_RECOMMENDED_ACTION_SCOPES[key] === 'project',
);

export class HomepageRecommendedActionSkipsModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private scopedQuery({
        organizationUuid,
        projectUuid,
    }: HomepageRecommendedActionSkipScope) {
        const query = this.database<HomepageRecommendedActionSkipsTable>(
            HomepageRecommendedActionSkipsTableName,
        ).where('organization_uuid', organizationUuid);

        return projectUuid === null
            ? query.whereNull('project_uuid')
            : query.where('project_uuid', projectUuid);
    }

    async list(
        scope: HomepageRecommendedActionSkipScope,
    ): Promise<SkippableHomepageRecommendedActionKey[]> {
        const rows = await this.database<HomepageRecommendedActionSkipsTable>(
            HomepageRecommendedActionSkipsTableName,
        )
            .where('organization_uuid', scope.organizationUuid)
            .where((scopeQuery) => {
                void scopeQuery.where((organizationQuery) => {
                    void organizationQuery
                        .whereNull('project_uuid')
                        .whereIn('action_key', ORGANIZATION_ACTION_KEYS);
                });
                if (scope.projectUuid !== null) {
                    void scopeQuery.orWhere((projectQuery) => {
                        void projectQuery
                            .where('project_uuid', scope.projectUuid)
                            .whereIn('action_key', PROJECT_ACTION_KEYS);
                    });
                }
            })
            .select('action_key')
            .orderBy('created_at', 'asc');

        return rows.map(({ action_key }) => action_key);
    }

    async create(
        scope: HomepageRecommendedActionSkipScope & {
            actionKey: SkippableHomepageRecommendedActionKey;
            createdByUserUuid: UUID;
        },
    ): Promise<void> {
        const conflictTarget =
            scope.projectUuid === null
                ? this.database.raw(
                      '(organization_uuid, action_key) WHERE project_uuid IS NULL',
                  )
                : this.database.raw(
                      '(organization_uuid, project_uuid, action_key) WHERE project_uuid IS NOT NULL',
                  );

        await this.database<HomepageRecommendedActionSkipsTable>(
            HomepageRecommendedActionSkipsTableName,
        )
            .insert({
                organization_uuid: scope.organizationUuid,
                project_uuid: scope.projectUuid,
                action_key: scope.actionKey,
                created_by_user_uuid: scope.createdByUserUuid,
            })
            .onConflict(conflictTarget)
            .ignore();
    }

    async delete(
        scope: HomepageRecommendedActionSkipScope & {
            actionKey: SkippableHomepageRecommendedActionKey;
        },
    ): Promise<void> {
        await this.scopedQuery(scope)
            .where('action_key', scope.actionKey)
            .delete();
    }
}
