import { Explore } from '@lightdash/common';
import { SystemModelMessage } from 'ai';
import moment from 'moment';
import { renderAvailableExplores } from './availableExplores';
import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';
import { DATA_ACCESS_ENABLED_SECTION } from './systemV2DataAccessEnabled';
import { SELF_IMPROVEMENT_SECTION } from './systemV2SelfImprovement';
import { SYSTEM_PROMPT_TEMPLATE } from './systemV2Template';

export const getSystemPromptV2 = (args: {
    availableExplores: Explore[];
    instructions?: string;
    agentName?: string;
    date?: string;
    time?: string;
    enableDataAccess?: boolean;
    enableSelfImprovement?: boolean;
}): SystemModelMessage => {
    const {
        instructions,
        agentName = 'Lightdash AI Analyst',
        date = moment().utc().format('YYYY-MM-DD'),
        time = moment().utc().format('HH:mm'),
        enableDataAccess = false,
        enableSelfImprovement = false,
    } = args;

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
        .replace('{{agent_name}}', agentName)
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace(
            '{{available_explores}}',
            renderAvailableExplores(args.availableExplores).toString(),
        );

    return {
        role: 'system',
        content,
    };
};
