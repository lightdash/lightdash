import { Knex } from 'knex';

const AiAgentMcpServerToolTableName = 'ai_agent_mcp_server_tool';
const PermissionModeColumnName = 'permission_mode';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentMcpServerToolTableName))) return;

    if (
        !(await knex.schema.hasColumn(
            AiAgentMcpServerToolTableName,
            PermissionModeColumnName,
        ))
    ) {
        await knex.schema.alterTable(AiAgentMcpServerToolTableName, (table) => {
            table
                .string(PermissionModeColumnName)
                .notNullable()
                .defaultTo('always_deny');
        });
    }

    if (await knex.schema.hasColumn(AiAgentMcpServerToolTableName, 'enabled')) {
        await knex.schema.alterTable(AiAgentMcpServerToolTableName, (table) => {
            table.boolean('enabled').notNullable().defaultTo(false).alter();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentMcpServerToolTableName))) return;

    if (await knex.schema.hasColumn(AiAgentMcpServerToolTableName, 'enabled')) {
        await knex.raw(
            `alter table "${AiAgentMcpServerToolTableName}" alter column "enabled" drop default`,
        );
    }

    if (
        await knex.schema.hasColumn(
            AiAgentMcpServerToolTableName,
            PermissionModeColumnName,
        )
    ) {
        await knex.schema.alterTable(AiAgentMcpServerToolTableName, (table) => {
            table.dropColumn(PermissionModeColumnName);
        });
    }
}
