import * as fs from 'fs/promises';
import * as path from 'path';
import type { AiAgentSkill } from '../ai/skills/types';
import type { LoadAgentSkillFn } from '../ai/types/aiAgentDependencies';
import { AUTOPILOT_CHART_SKILL_NAME } from './config/agent';

// Autopilot creates and fixes charts with its own action tools, so it gets the
// built-in chart references under an Autopilot-specific workflow body.
export const loadAutopilotSkill = async (
    name: string,
    loadBuiltInSkill: LoadAgentSkillFn,
): Promise<AiAgentSkill | undefined> => {
    if (name !== AUTOPILOT_CHART_SKILL_NAME) return undefined;
    const builtIn = await loadBuiltInSkill(name, { arguments: null });
    if (!builtIn) return undefined;
    return {
        ...builtIn,
        body: await fs.readFile(
            path.join(__dirname, 'chart-workflows.md'),
            'utf8',
        ),
        resources:
            builtIn.resources?.filter(
                (resource) =>
                    resource.name.endsWith('-chart-reference') ||
                    resource.name === 'field-formatting-reference',
            ) ?? [],
    };
};
