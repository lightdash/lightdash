import {
    type DeploySession,
    DeploySessionStatus,
    type Explore,
    type ExploreError,
    NotFoundError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    type DbDeploySession,
    type DbDeploySessionBatch,
    type DbDeploySessionBatchInsert,
    DeploySessionBatchesTable,
    DeploySessionsTable,
} from '../database/entities/deploySessions';

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
    ): Promise<void> {
        const batchInsert: DbDeploySessionBatchInsert = {
            deploy_session_uuid: sessionUuid,
            project_uuid: projectUuid,
            batch_number: batchNumber,
            explores: JSON.stringify(explores), // Stringify for JSONB
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

    async getAllExplores(
        sessionUuid: string,
    ): Promise<(Explore | ExploreError)[]> {
        const batches = await DeploySessionBatchesTable(this.database)
            .where('deploy_session_uuid', sessionUuid)
            .orderBy('batch_number', 'asc');

        // Flatten all explores from all batches
        const allExplores: (Explore | ExploreError)[] = [];
        for (const batch of batches) {
            // JSONB fields are automatically parsed by Knex
            const explores = batch.explores as (Explore | ExploreError)[];
            allExplores.push(...explores);
        }

        return allExplores;
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
