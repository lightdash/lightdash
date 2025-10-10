import { SystemModelMessage } from 'ai';
import fs from 'fs';
import moment from 'moment';
import path from 'path';

const SYSTEM_PROMPT_TEMPLATE = fs.readFileSync(
    path.join(__dirname, 'systemV2.txt'),
    'utf-8',
);

const selfImprovementSection = fs.readFileSync(
    path.join(__dirname, 'systemV2_selfImprovement.txt'),
    'utf-8',
);

const dataAccessEnabledSection = fs.readFileSync(
    path.join(__dirname, 'systemV2_dataAccessEnabled.txt'),
    'utf-8',
);

const dataAccessDisabledSection = fs.readFileSync(
    path.join(__dirname, 'systemV2_dataAccessDisabled.txt'),
    'utf-8',
);

export const getSystemPromptV2 = (args: {
    availableExplores: string[];
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
        enableSelfImprovement ? selfImprovementSection : '',
    )
        .replace(
            '{{data_access_section}}',
            enableDataAccess
                ? dataAccessEnabledSection
                : dataAccessDisabledSection,
        )
        .replace('{{agent_name}}', agentName)
        .replace('{{available_explores}}', args.availableExplores.join(', '))
        .replace(
            '{{instructions}}',
            instructions ? `Special instructions: ${instructions}` : '',
        )
        .replace('{{date}}', date)
        .replace('{{time}}', time);

    return {
        role: 'system',
        content,
    };
};
