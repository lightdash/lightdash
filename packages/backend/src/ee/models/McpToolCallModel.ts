import { Knex } from 'knex';
import {
    DbMcpClientInfo,
    DbMcpToolCall,
    McpClientInfoTableName,
    McpToolCallTableName,
} from '../database/entities/mcpToolCall';

export type CreateMcpToolCall = Omit<
    DbMcpToolCall,
    'mcp_tool_call_uuid' | 'created_at' | 'tool_args' | 'result_metadata'
> & {
    tool_args: object;
    result_metadata: object | null;
};

export type UpsertMcpClientInfo = {
    userUuid: string;
    organizationUuid: string;
    userAgent: string;
    clientName: string;
    clientVersion: string | null;
};

// Oversized args are replaced (not truncated mid-JSON) so tool_args stays
// valid jsonb; the original size is kept for the admin UI to explain the gap.
const MAX_TOOL_ARGS_BYTES = 64 * 1024;

const capToolArgs = (args: object): object => {
    const serialized = JSON.stringify(args);
    if (serialized.length <= MAX_TOOL_ARGS_BYTES) {
        return args;
    }
    return {
        truncated: true,
        originalSizeBytes: serialized.length,
    };
};

export class McpToolCallModel {
    private database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async createToolCall(data: CreateMcpToolCall): Promise<void> {
        await this.database(McpToolCallTableName).insert({
            ...data,
            tool_args: capToolArgs(data.tool_args),
        });
    }

    async upsertClientInfo(data: UpsertMcpClientInfo): Promise<void> {
        await this.database(McpClientInfoTableName)
            .insert({
                user_uuid: data.userUuid,
                organization_uuid: data.organizationUuid,
                user_agent: data.userAgent,
                client_name: data.clientName,
                client_version: data.clientVersion,
            })
            .onConflict(['user_uuid', 'organization_uuid', 'user_agent'])
            .merge({
                client_name: data.clientName,
                client_version: data.clientVersion,
                updated_at: this.database.fn.now(),
            });
    }

    async findClientInfo(
        userUuid: string,
        organizationUuid: string,
        userAgent: string,
    ): Promise<DbMcpClientInfo | undefined> {
        return this.database(McpClientInfoTableName)
            .where({
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                user_agent: userAgent,
            })
            .first();
    }

    async deleteToolCallsOlderThan(days: number): Promise<number> {
        // A non-positive retention would compute a future cutoff and delete
        // everything
        if (!Number.isInteger(days) || days <= 0) {
            throw new Error(`Invalid retention days: ${days}`);
        }
        return this.database(McpToolCallTableName)
            .where(
                'created_at',
                '<',
                this.database.raw('now() - make_interval(days => ?)', [days]),
            )
            .delete();
    }
}
