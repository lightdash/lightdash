import { type DeploySessionStatus } from '@lightdash/common';
import { type Knex } from 'knex';

export const DEPLOY_SESSIONS_TABLE_NAME = 'deploy_sessions';
export const DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME =
    'deploy_session_batch_explores';

export type DbDeploySession = {
    deploy_session_uuid: string;
    project_uuid: string;
    user_uuid: string;
    status: DeploySessionStatus;
    batch_count: number;
    explore_count: number;
    created_at: Date;
};

export type DbDeploySessionBatch = {
    deploy_session_batch_uuid: string;
    deploy_session_uuid: string;
    project_uuid: string;
    batch_number: number;
    explores: unknown; // JSONB array of Explore or ExploreError objects
    explore_count: number;
    created_at: Date;
};

export type DbDeploySessionInsert = Omit<
    DbDeploySession,
    'deploy_session_uuid' | 'created_at'
>;

export type DbDeploySessionBatchInsert = Omit<
    DbDeploySessionBatch,
    'deploy_session_batch_uuid' | 'created_at'
>;

export const DeploySessionsTable = (
    database: Knex,
): Knex.QueryBuilder<DbDeploySession> =>
    database<DbDeploySession>(DEPLOY_SESSIONS_TABLE_NAME);

export const DeploySessionBatchesTable = (
    database: Knex,
): Knex.QueryBuilder<DbDeploySessionBatch> =>
    database<DbDeploySessionBatch>(DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME);
