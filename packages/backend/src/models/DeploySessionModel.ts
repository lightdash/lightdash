import {
    DeploySessionStatus,
    NotFoundError,
    type DeploySession,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DeploySessionBatchesTable,
    DeploySessionsTable,
    type DbDeploySession,
    type DbDeploySessionBatch,
    type DbDeploySessionBatchInsert,
} from '../database/entities/deploySessions';

type StoredDeploySessionBatch = {
    explores: (Explore | ExploreError)[];
    complete: boolean;
};

export class DeploySessionModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async createSession(
        projectUuid: string,
        userUuid: string,
    ): Promise<string> {
        const [session] = await DeploySessionsTable(this.database)
            .insert({
                project_uuid: projectUuid,
                user_uuid: userUuid,
                status: DeploySessionStatus.UPLOADING,
                batch_count: 0,
                explore_count: 0,
            })
            .returning('deploy_session_uuid');

        return session.deploy_session_uuid;
    }

    async getSession(sessionUuid: string): Promise<DeploySession> {
        const session = await DeploySessionsTable(this.database)
            .where('deploy_session_uuid', sessionUuid)
            .first();

        if (!session) {
            throw new NotFoundError(`Deploy session ${sessionUuid} not found`);
        }

        return DeploySessionModel.mapDbSessionToDeploySession(session);
    }

    async addBatch(
        sessionUuid: string,
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        batchNumber: number,
        complete?: boolean,
    ): Promise<void> {
        const batchInsert: DbDeploySessionBatchInsert = {
            deploy_session_uuid: sessionUuid,
            project_uuid: projectUuid,
            batch_number: batchNumber,
            explores: JSON.stringify({
                explores,
                complete: complete === true,
            } satisfies StoredDeploySessionBatch),
            explore_count: explores.length,
        };

        await this.database.transaction(async (trx) => {
            // Insert batch
            await DeploySessionBatchesTable(trx).insert(batchInsert);

            // Update session counters
            await DeploySessionsTable(trx)
                .where('deploy_session_uuid', sessionUuid)
                .increment('batch_count', 1)
                .increment('explore_count', explores.length);
        });
    }

    async getDeployData(sessionUuid: string): Promise<{
        explores: (Explore | ExploreError)[];
        complete: boolean;
    }> {
        const batches = await DeploySessionBatchesTable(this.database)
            .where('deploy_session_uuid', sessionUuid)
            .orderBy('batch_number', 'asc');

        const allExplores: (Explore | ExploreError)[] = [];
        let complete = batches.length > 0;
        for (const batch of batches) {
            if (Array.isArray(batch.explores)) {
                allExplores.push(
                    ...(batch.explores as (Explore | ExploreError)[]),
                );
                complete = false;
            } else {
                const storedBatch = batch.explores as StoredDeploySessionBatch;
                allExplores.push(...storedBatch.explores);
                complete = complete && storedBatch.complete === true;
            }
        }

        return { explores: allExplores, complete };
    }

    async updateStatus(
        sessionUuid: string,
        status: DeploySessionStatus,
    ): Promise<void> {
        const updated = await DeploySessionsTable(this.database)
            .where('deploy_session_uuid', sessionUuid)
            .update({ status });

        if (updated === 0) {
            throw new NotFoundError(`Deploy session ${sessionUuid} not found`);
        }
    }

    async deleteSession(sessionUuid: string): Promise<void> {
        // CASCADE delete will remove explores automatically
        await DeploySessionsTable(this.database)
            .where('deploy_session_uuid', sessionUuid)
            .delete();
    }

    async cleanupOldSessions(olderThanMinutes: number): Promise<number> {
        const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

        // CASCADE delete will remove explores automatically
        const deleted = await DeploySessionsTable(this.database)
            .where('created_at', '<', cutoffTime)
            .delete();

        return deleted;
    }

    static mapDbSessionToDeploySession(
        dbSession: DbDeploySession,
    ): DeploySession {
        return {
            deploySessionUuid: dbSession.deploy_session_uuid,
            projectUuid: dbSession.project_uuid,
            userUuid: dbSession.user_uuid,
            status: dbSession.status,
            batchCount: dbSession.batch_count,
            exploreCount: dbSession.explore_count,
            createdAt: dbSession.created_at,
        };
    }
}
