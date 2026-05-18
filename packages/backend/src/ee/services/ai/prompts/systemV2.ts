import { Explore, WarehouseTypes } from '@lightdash/common';
import { SystemModelMessage } from 'ai';
import moment from 'moment';
import { renderAvailableExplores } from './availableExplores';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import { getRunSqlSection } from './systemV2RunSql';
import { SELF_IMPROVEMENT_SECTION } from './systemV2SelfImprovement';
import { SYSTEM_PROMPT_TEMPLATE } from './systemV2Template';

export const getSystemPromptV2 = (args: {
    availableExplores: Explore[];
    instructions?: string;
    agentName?: string;
    date?: string;
    enableDataAccess?: boolean;
    enableSelfImprovement?: boolean;
    canRunSql?: boolean;
    warehouseType?: WarehouseTypes | null;
    warehouseSchema?: string | null;
}): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        date = moment().utc().format('YYYY-MM-DD'),
        enableDataAccess = false,
        enableSelfImprovement = false,
        canRunSql = false,
        warehouseType = null,
        warehouseSchema = null,
    } = args;

    const crossExploreJoinRule = canRunSql
        ? '  - You cannot mix fields from different explores in a single runQuery call. When the user needs data combined across explores that are not joined in the semantic layer, use the runSql tool to write raw SQL across those tables.'
        : '  - You can not mix fields from different explores.';

    const customSqlLimitation = canRunSql
        ? ''
        : '\n- You cannot execute raw SQL or add custom SQL expressions to a query.';

    const AVAILABLE_EXPLORES_INLINE_LIMIT = 15;
    let availableExploresContent: string;
    if (args.availableExplores.length === 0) {
        availableExploresContent =
            'No explores are available to this agent. Tell the user there is no data you can query and suggest they ask an administrator to set up explores or adjust the agent configuration.';
    } else if (
        args.availableExplores.length <= AVAILABLE_EXPLORES_INLINE_LIMIT
    ) {
        availableExploresContent = renderAvailableExplores(
            args.availableExplores,
        ).toString();
    } else {
        availableExploresContent = `This agent has access to ${args.availableExplores.length} explores. Use findExplores to discover the relevant one for each request.`;
    }

    const content = SYSTEM_PROMPT_TEMPLATE.replace(
        '{{self_improvement_section}}',
        enableSelfImprovement ? SELF_IMPROVEMENT_SECTION : '',
    )
        .replace(
            '{{data_access_section}}',
            enableDataAccess
                ? DATA_ACCESS_ENABLED_SECTION
                : DATA_ACCESS_DISABLED_SECTION,
        )
        .replace(
            '{{run_sql_section}}',
            canRunSql ? getRunSqlSection(warehouseType, warehouseSchema) : '',
        )
        .replace('{{cross_explore_join_rule}}', crossExploreJoinRule)
        .replace('{{custom_sql_limitation}}', customSqlLimitation)
        .replace('{{agent_name}}', agentName)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace('{{date}}', date)
        .replace('{{available_explores}}', availableExploresContent);

    return {
        role: 'system',
        content,
        providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
        },
    };
};
