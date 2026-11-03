import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AnalyticsContentSyncTableName,
    type DbAnalyticsContentSync,
} from '../database/entities/analyticsContentSync';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName, type DbUser } from '../database/entities/users';

export type AnalyticsContentSyncState = {
    systemUserUuid: string | null;
    appliedHash: string | null;
    appliedVersion: string | null;
    lastSyncedAt: Date | null;
};

export type AnalyticsContentSyncProject = {
    projectUuid: string;
    organizationUuid: string;
    organizationName: string;
};

export type AnalyticsSyncSystemUser = {
    userUuid: string;
    userId: number;
    createdAt: Date;
    updatedAt: Date;
};

export class AnalyticsContentSyncModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private projectsQuery() {
        return this.database(ProjectTableName)
            .join(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(`${ProjectTableName}.provisioning_source`, 'analytics')
            .select<AnalyticsContentSyncProject[]>(
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${OrganizationTableName}.organization_uuid as organizationUuid`,
                `${OrganizationTableName}.organization_name as organizationName`,
            );
    }

    async getProject(
        projectUuid: string,
    ): Promise<AnalyticsContentSyncProject | null> {
        const project = await this.projectsQuery()
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .first();
        return project ?? null;
    }

    async getProjectsPage({
        organizationUuid,
        afterProjectUuid,
        limit,
    }: {
        organizationUuid: string | null;
        afterProjectUuid: string | null;
        limit: number;
    }): Promise<AnalyticsContentSyncProject[]> {
        const query = this.projectsQuery()
            .orderBy(`${ProjectTableName}.project_uuid`)
            .limit(limit);
        if (organizationUuid !== null)
            query.where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            );
        if (afterProjectUuid !== null)
            query.where(
                `${ProjectTableName}.project_uuid`,
                '>',
                afterProjectUuid,
            );
        return query;
    }

    async get(projectUuid: string): Promise<AnalyticsContentSyncState | null> {
        const row = await this.database<DbAnalyticsContentSync>(
            AnalyticsContentSyncTableName,
        )
            .where('project_uuid', projectUuid)
            .first();
        return row
            ? {
                  systemUserUuid: row.system_user_uuid,
                  appliedHash: row.applied_hash,
                  appliedVersion: row.applied_version,
                  lastSyncedAt: row.last_synced_at,
              }
            : null;
    }

    async getOrCreateSystemUser(
        projectUuid: string,
    ): Promise<AnalyticsSyncSystemUser> {
        return this.database.transaction(async (trx) => {
            const project = await trx(ProjectTableName)
                .where({
                    project_uuid: projectUuid,
                    provisioning_source: 'analytics',
                })
                .select('project_uuid')
                .forUpdate()
                .first();
            if (!project)
                throw new NotFoundError('Analytics project not found');

            const state = await trx<DbAnalyticsContentSync>(
                AnalyticsContentSyncTableName,
            )
                .where('project_uuid', projectUuid)
                .first();
            let user: DbUser | undefined;
            if (state?.system_user_uuid) {
                user = await trx<DbUser>(UserTableName)
                    .where('user_uuid', state.system_user_uuid)
                    .first();
            } else {
                [user] = await trx<DbUser>(UserTableName)
                    .insert({
                        first_name: 'Analytics system',
                        last_name: '',
                        is_active: false,
                        is_internal: true,
                        is_setup_complete: true,
                        is_marketing_opted_in: false,
                        is_tracking_anonymized: false,
                    })
                    .returning('*');
                await trx(AnalyticsContentSyncTableName)
                    .insert({
                        project_uuid: projectUuid,
                        system_user_uuid: user.user_uuid,
                    })
                    .onConflict('project_uuid')
                    .merge({ system_user_uuid: user.user_uuid });
            }
            if (!user || !user.is_internal || user.is_active)
                throw new NotFoundError('Analytics system user not found');
            return {
                userUuid: user.user_uuid,
                userId: user.user_id,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
            };
        });
    }

    async markSynced(
        projectUuid: string,
        { hash, version }: { hash: string; version: string },
    ): Promise<void> {
        const applied = {
            applied_hash: hash,
            applied_version: version,
            last_synced_at: this.database.fn.now(),
        };
        await this.database(AnalyticsContentSyncTableName)
            .insert({ project_uuid: projectUuid, ...applied })
            .onConflict('project_uuid')
            .merge(applied);
    }
}
