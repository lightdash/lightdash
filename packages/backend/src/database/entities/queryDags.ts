import type {
    QueryDagNodeStatus,
    QueryDagStatus,
    QueryExecutionContext,
    QuerySourceType,
    SourceQuery,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbQueryDag = {
    query_dag_uuid: string;
    project_uuid: string;
    organization_uuid: string;
    created_by_user_uuid: string | null;
    status: QueryDagStatus;
    error: string | null;
    context: QueryExecutionContext;
    created_at: Date;
    updated_at: Date;
};

export type DbQueryDagIn = Omit<
    DbQueryDag,
    'query_dag_uuid' | 'error' | 'created_at' | 'updated_at'
>;

export type DbQueryDagUpdate = Partial<
    Pick<DbQueryDag, 'status' | 'error' | 'updated_at'>
>;

export type QueryDagsTable = Knex.CompositeTableType<
    DbQueryDag,
    DbQueryDagIn,
    DbQueryDagUpdate
>;

export const QueryDagsTableName = 'query_dags';

export type DbQueryDagNode = {
    query_dag_node_uuid: string;
    query_dag_uuid: string;
    node_id: string;
    source_type: QuerySourceType;
    query: SourceQuery;
    depends_on: string[];
    status: QueryDagNodeStatus;
    query_uuid: string | null;
    error: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbQueryDagNodeIn = Omit<
    DbQueryDagNode,
    'query_dag_node_uuid' | 'query_uuid' | 'error' | 'created_at' | 'updated_at'
>;

export type DbQueryDagNodeUpdate = Partial<
    Pick<DbQueryDagNode, 'status' | 'query_uuid' | 'error' | 'updated_at'>
>;

export type QueryDagNodesTable = Knex.CompositeTableType<
    DbQueryDagNode,
    DbQueryDagNodeIn,
    DbQueryDagNodeUpdate
>;

export const QueryDagNodesTableName = 'query_dag_nodes';
