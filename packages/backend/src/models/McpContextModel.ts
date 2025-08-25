import { Knex } from 'knex';

const MCP_CONTEXT_TABLE = 'mcp_context';

export interface McpContext {
    projectUuid: string;
    projectName: string;
    tags: string[] | null;
}

export interface McpContextRow {
    user_uuid: string;
    organization_uuid: string;
    context: McpContext;
    created_at: Date;
    updated_at: Date;
}

export interface CreateMcpContext {
    userUuid: string;
    organizationUuid: string;
    context: McpContext;
}

export interface UpsertMcpContext {
    context: McpContext;
}

export class McpContextModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async getContext(
        userUuid: string,
        organizationUuid: string,
    ): Promise<McpContextRow | undefined> {
        const [row] = await this.database(MCP_CONTEXT_TABLE)
            .where({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
            })
            .select('*');

        return row;
    }

    async setContext(data: CreateMcpContext): Promise<McpContextRow> {
        const [row] = await this.database(MCP_CONTEXT_TABLE)
            .insert({
                user_uuid: data.userUuid,
                organization_uuid: data.organizationUuid,
                context: JSON.stringify(data.context),
            })
            .onConflict(['user_uuid', 'organization_uuid'])
            .merge({
                context: JSON.stringify(data.context),
                updated_at: this.database.fn.now(),
            })
            .returning('*');

        return row;
    }

    async upsertContext(
        userUuid: string,
        organizationUuid: string,
        data: UpsertMcpContext,
    ): Promise<McpContextRow> {
        const [row] = await this.database(MCP_CONTEXT_TABLE)
            .insert({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                context: JSON.stringify(data.context),
            })
            .onConflict(['user_uuid', 'organization_uuid'])
            .merge({
                context: JSON.stringify(data.context),
                updated_at: this.database.fn.now(),
            })
            .returning('*');

        return row;
    }
}
