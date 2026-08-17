import {
    NotFoundError,
    QueryDagNodeStatus,
    QueryDagStatus,
    type QueryDag,
    type QueryDagNode,
    type QueryExecutionContext,
    type QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    QueryDagNodesTableName,
    QueryDagsTableName,
    type DbQueryDag,
    type DbQueryDagNode,
} from '../../database/entities/queryDags';

type CreateQueryDagNodeArgs = {
    nodeId: string;
    sourceType: QuerySourceType;
    query: SourceQuery;
    dependsOn: string[];
};

type CreateQueryDagArgs = {
    projectUuid: string;
    organizationUuid: string;
    createdByUserUuid: string | null;
    context: QueryExecutionContext;
    nodes: CreateQueryDagNodeArgs[];
};

/**
 * The dag as the model returns it: the public QueryDag shape plus the
 * ownership fields services need for access checks.
 */
export type QueryDagWithOwnership = QueryDag & {
    organizationUuid: string;
    createdByUserUuid: string | null;
};

export class QueryDagModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static convertNode(row: DbQueryDagNode): QueryDagNode {
        return {
            nodeId: row.node_id,
            sourceType: row.source_type,
            status: row.status,
            queryUuid: row.query_uuid,
            error: row.error,
        };
    }

    private static convertDag(
        row: DbQueryDag,
        nodeRows: DbQueryDagNode[],
    ): QueryDagWithOwnership {
        return {
            queryDagUuid: row.query_dag_uuid,
            projectUuid: row.project_uuid,
            status: row.status,
            error: row.error,
            createdAt: row.created_at,
            nodes: nodeRows.map(QueryDagModel.convertNode),
            organizationUuid: row.organization_uuid,
            createdByUserUuid: row.created_by_user_uuid,
        };
    }

    async create(args: CreateQueryDagArgs): Promise<QueryDagWithOwnership> {
        return this.database.transaction(async (trx) => {
            const [dagRow] = await trx(QueryDagsTableName)
                .insert({
                    project_uuid: args.projectUuid,
                    organization_uuid: args.organizationUuid,
                    created_by_user_uuid: args.createdByUserUuid,
                    status: QueryDagStatus.PENDING,
                    context: args.context,
                })
                .returning('*');

            const nodeRows = await trx(QueryDagNodesTableName)
                .insert(
                    args.nodes.map((node) => ({
                        query_dag_uuid: dagRow.query_dag_uuid,
                        node_id: node.nodeId,
                        source_type: node.sourceType,
                        query: node.query,
                        depends_on: node.dependsOn,
                        status: QueryDagNodeStatus.PENDING,
                    })),
                )
                .returning('*');

            return QueryDagModel.convertDag(dagRow, nodeRows);
        });
    }

    async get(
        queryDagUuid: string,
        projectUuid: string,
    ): Promise<QueryDagWithOwnership> {
        const dagRow = await this.database(QueryDagsTableName)
            .where('query_dag_uuid', queryDagUuid)
            .andWhere('project_uuid', projectUuid)
            .first();

        if (!dagRow) {
            throw new NotFoundError(`Query DAG ${queryDagUuid} not found`);
        }

        const nodeRows = await this.database(QueryDagNodesTableName)
            .where('query_dag_uuid', queryDagUuid)
            .orderBy('created_at', 'asc')
            .orderBy('node_id', 'asc');

        return QueryDagModel.convertDag(dagRow, nodeRows);
    }

    async updateDag(
        queryDagUuid: string,
        update: { status: QueryDagStatus; error?: string | null },
    ): Promise<void> {
        await this.database(QueryDagsTableName)
            .where('query_dag_uuid', queryDagUuid)
            .update({
                status: update.status,
                error: update.error ?? null,
                updated_at: new Date(),
            });
    }

    async updateNode(
        queryDagUuid: string,
        nodeId: string,
        update: {
            status: QueryDagNodeStatus;
            queryUuid?: string;
            error?: string | null;
        },
    ): Promise<void> {
        await this.database(QueryDagNodesTableName)
            .where('query_dag_uuid', queryDagUuid)
            .andWhere('node_id', nodeId)
            .update({
                status: update.status,
                ...(update.queryUuid ? { query_uuid: update.queryUuid } : {}),
                error: update.error ?? null,
                updated_at: new Date(),
            });
    }
}
