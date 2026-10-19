import { type ThreadComposerQueryNode } from '@lightdash/common';
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
    tool_call_id: string;
    created_at: Date;
};

export type ComposerQueryNodesTable = Knex.CompositeTableType<
    DbComposerQueryNode,
    Omit<DbComposerQueryNode, 'composer_query_node_uuid' | 'created_at'>,
    never
>;
