import {
    KnexPaginateArgs,
    KnexPaginatedData,
    McpActivityFilters,
    McpActivityItem,
    McpActivitySort,
    McpActivityStats,
    McpActivityStatsFilters,
} from '@lightdash/common';
import { Knex } from 'knex';
import { EmailTableName } from '../../database/entities/emails';
import { ProjectTableName } from '../../database/entities/projects';
import { UserTableName } from '../../database/entities/users';
import KnexPaginate from '../../database/pagination';
import { AiAgentTableName } from '../database/entities/aiAgent';
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

const STATS_TOP_TOOLS_LIMIT = 6;
const STATS_AGENTS_LIMIT = 6;
const STATS_RECENT_ERRORS_LIMIT = 5;

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

    private buildActivityQuery(
        organizationUuid: string,
        filters?: McpActivityFilters,
    ): Knex.QueryBuilder {
        const query = this.database(McpToolCallTableName).where(
            `${McpToolCallTableName}.organization_uuid`,
            organizationUuid,
        );

        if (filters?.projectUuids && filters.projectUuids.length > 0) {
            void query.whereIn(
                `${McpToolCallTableName}.project_uuid`,
                filters.projectUuids,
            );
        }
        if (filters?.userUuids && filters.userUuids.length > 0) {
            void query.whereIn(
                `${McpToolCallTableName}.user_uuid`,
                filters.userUuids,
            );
        }
        if (filters?.agentUuids && filters.agentUuids.length > 0) {
            void query.whereIn(
                `${McpToolCallTableName}.agent_uuid`,
                filters.agentUuids,
            );
        }
        if (filters?.toolNames && filters.toolNames.length > 0) {
            void query.whereIn(
                `${McpToolCallTableName}.tool_name`,
                filters.toolNames,
            );
        }
        if (filters?.clientNames && filters.clientNames.length > 0) {
            void query.whereIn(
                `${McpToolCallTableName}.client_name`,
                filters.clientNames,
            );
        }
        if (filters?.status) {
            void query.where(`${McpToolCallTableName}.status`, filters.status);
        }
        if (filters?.dateFrom) {
            void query.where(
                `${McpToolCallTableName}.created_at`,
                '>=',
                filters.dateFrom,
            );
        }
        if (filters?.dateTo) {
            void query.where(
                `${McpToolCallTableName}.created_at`,
                '<=',
                filters.dateTo,
            );
        }

        return query;
    }

    async findActivityPaginated({
        organizationUuid,
        paginateArgs,
        filters,
        sort,
    }: {
        organizationUuid: string;
        paginateArgs?: KnexPaginateArgs;
        filters?: McpActivityFilters;
        sort?: McpActivitySort;
    }): Promise<KnexPaginatedData<McpActivityItem[]>> {
        const query = this.buildActivityQuery(organizationUuid, filters)
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${McpToolCallTableName}.user_uuid`,
            )
            .leftJoin(EmailTableName, function joinPrimaryEmail() {
                void this.on(
                    `${EmailTableName}.user_id`,
                    '=',
                    `${UserTableName}.user_id`,
                ).andOnVal(`${EmailTableName}.is_primary`, true);
            })
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${McpToolCallTableName}.project_uuid`,
            )
            .leftJoin(
                AiAgentTableName,
                `${AiAgentTableName}.ai_agent_uuid`,
                `${McpToolCallTableName}.agent_uuid`,
            )
            .select<
                {
                    mcp_tool_call_uuid: string;
                    created_at: Date;
                    user_uuid: string;
                    user_name: string;
                    user_email: string | null;
                    project_uuid: string | null;
                    project_name: string | null;
                    agent_uuid: string | null;
                    agent_name: string | null;
                    tool_name: string;
                    tool_args: Record<string, unknown>;
                    status: 'success' | 'error';
                    error_message: string | null;
                    duration_ms: number;
                    client_name: string | null;
                    client_version: string | null;
                    user_agent: string | null;
                    auth_type: string;
                    protocol_version: string | null;
                    mcp_session_id: string | null;
                }[]
            >([
                `${McpToolCallTableName}.mcp_tool_call_uuid`,
                `${McpToolCallTableName}.created_at`,
                `${McpToolCallTableName}.user_uuid`,
                this.database.raw(
                    `COALESCE(NULLIF(TRIM(CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name)), ''), ${EmailTableName}.email, 'Unknown user') as user_name`,
                ),
                `${EmailTableName}.email as user_email`,
                `${McpToolCallTableName}.project_uuid`,
                `${ProjectTableName}.name as project_name`,
                `${McpToolCallTableName}.agent_uuid`,
                `${AiAgentTableName}.name as agent_name`,
                `${McpToolCallTableName}.tool_name`,
                `${McpToolCallTableName}.tool_args`,
                `${McpToolCallTableName}.status`,
                `${McpToolCallTableName}.error_message`,
                `${McpToolCallTableName}.duration_ms`,
                `${McpToolCallTableName}.client_name`,
                `${McpToolCallTableName}.client_version`,
                `${McpToolCallTableName}.user_agent`,
                `${McpToolCallTableName}.auth_type`,
                `${McpToolCallTableName}.protocol_version`,
                `${McpToolCallTableName}.mcp_session_id`,
            ]);

        const sortColumn =
            sort?.field === 'durationMs' ? 'duration_ms' : 'created_at';
        // uuid tie-breaker keeps pagination stable when sort values collide
        void query.orderBy([
            {
                column: `${McpToolCallTableName}.${sortColumn}`,
                order: sort?.direction ?? 'desc',
            },
            {
                column: `${McpToolCallTableName}.mcp_tool_call_uuid`,
                order: 'asc',
            },
        ]);

        const { data, pagination } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            data: data.map((row) => ({
                uuid: row.mcp_tool_call_uuid,
                createdAt: row.created_at.toISOString(),
                user: {
                    uuid: row.user_uuid,
                    name: row.user_name,
                    email: row.user_email,
                },
                project: row.project_uuid
                    ? {
                          uuid: row.project_uuid,
                          name: row.project_name ?? 'Unknown project',
                      }
                    : null,
                agent: row.agent_uuid
                    ? {
                          uuid: row.agent_uuid,
                          name: row.agent_name ?? 'Unknown agent',
                      }
                    : null,
                toolName: row.tool_name,
                toolArgs: row.tool_args,
                status: row.status,
                errorMessage: row.error_message,
                durationMs: row.duration_ms,
                clientName: row.client_name,
                clientVersion: row.client_version,
                userAgent: row.user_agent,
                authType: row.auth_type,
                protocolVersion: row.protocol_version,
                sessionId: row.mcp_session_id,
            })),
            pagination,
        };
    }

    async getActivityStats({
        organizationUuid,
        filters,
    }: {
        organizationUuid: string;
        filters?: McpActivityStatsFilters;
    }): Promise<McpActivityStats> {
        const countsQuery = this.buildActivityQuery(organizationUuid, filters)
            .select<{ total_calls: number; error_calls: number }[]>(
                this.database.raw('count(*)::int as total_calls'),
                this.database.raw(
                    `count(*) filter (where ${McpToolCallTableName}.status = 'error')::int as error_calls`,
                ),
            )
            .first();

        const topToolsQuery = this.buildActivityQuery(organizationUuid, filters)
            .select<{ tool_name: string; count: number }[]>(
                `${McpToolCallTableName}.tool_name`,
                this.database.raw('count(*)::int as count'),
            )
            .groupBy(`${McpToolCallTableName}.tool_name`)
            .orderBy([
                { column: 'count', order: 'desc' },
                { column: 'tool_name', order: 'asc' },
            ])
            .limit(STATS_TOP_TOOLS_LIMIT);

        const agentsQuery = this.buildActivityQuery(organizationUuid, filters)
            .leftJoin(
                AiAgentTableName,
                `${AiAgentTableName}.ai_agent_uuid`,
                `${McpToolCallTableName}.agent_uuid`,
            )
            .select<
                {
                    agent_uuid: string | null;
                    agent_name: string | null;
                    count: number;
                }[]
            >(
                `${McpToolCallTableName}.agent_uuid`,
                `${AiAgentTableName}.name as agent_name`,
                this.database.raw('count(*)::int as count'),
            )
            .groupBy([
                `${McpToolCallTableName}.agent_uuid`,
                `${AiAgentTableName}.name`,
            ])
            .orderBy([
                { column: 'count', order: 'desc' },
                { column: 'agent_name', order: 'asc' },
            ])
            .limit(STATS_AGENTS_LIMIT);

        const recentErrorsQuery = this.findActivityPaginated({
            organizationUuid,
            paginateArgs: { page: 1, pageSize: STATS_RECENT_ERRORS_LIMIT },
            filters: { ...filters, status: 'error' },
            sort: { field: 'createdAt', direction: 'desc' },
        });

        const [counts, topTools, agents, recentErrors] = await Promise.all([
            countsQuery,
            topToolsQuery,
            agentsQuery,
            recentErrorsQuery,
        ]);

        return {
            totalCalls: counts?.total_calls ?? 0,
            errorCalls: counts?.error_calls ?? 0,
            topTools: topTools.map((row) => ({
                toolName: row.tool_name,
                count: row.count,
            })),
            agents: agents.map((row) => ({
                agent: row.agent_uuid
                    ? {
                          uuid: row.agent_uuid,
                          name: row.agent_name ?? 'Unknown agent',
                      }
                    : null,
                count: row.count,
            })),
            recentErrors: recentErrors.data,
        };
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
