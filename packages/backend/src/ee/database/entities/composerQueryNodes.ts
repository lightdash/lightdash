import {
    type ComposerNodeColumn,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ComposerQueryNodesTableName = 'composer_query_nodes';

export type ComposerQueryNodeScopeType = 'thread';

export const THREAD_COMPOSER_QUERY_SCOPE_TYPE: ComposerQueryNodeScopeType =
    'thread';

export type ComposerQueryNodeScope = {
    scopeType: ComposerQueryNodeScopeType;
    scopeUuid: string;
};

export const threadComposerQueryScope = (
    threadUuid: string,
): ComposerQueryNodeScope => ({
    scopeType: THREAD_COMPOSER_QUERY_SCOPE_TYPE,
    scopeUuid: threadUuid,
});

/** A node definition registered in a scope, unique by node id. */
export type DbComposerQueryNode = {
    composer_query_node_uuid: string;
    scope_type: ComposerQueryNodeScopeType;
    scope_uuid: string;
    node_id: string;
    definition: ThreadComposerQueryNode;
    /** Null on rows registered before columns were stored. */
    node_columns: ComposerNodeColumn[] | null;
    created_at: Date;
};

// node_columns is written as a JSON string: pg would serialize a JS array as a Postgres array.
type DbComposerQueryNodeWrite = {
    node_columns: string | null;
};

export type ComposerQueryNodesTable = Knex.CompositeTableType<
    DbComposerQueryNode,
    Omit<
        DbComposerQueryNode,
        'composer_query_node_uuid' | 'created_at' | 'node_columns'
    > &
        DbComposerQueryNodeWrite,
    DbComposerQueryNodeWrite
>;
