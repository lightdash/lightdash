import * as fs from 'fs/promises';
import matter from 'gray-matter';
import * as path from 'path';
import type { AiAgentSkill } from '../ai/skills/types';
import type { LoadAgentSkillFn } from '../ai/types/aiAgentDependencies';
import {
    AUTOPILOT_CHART_SKILL_NAME,
    AUTOPILOT_SLACK_SKILL_NAME,
} from './config/agent';

const SLACK_SKILL_PATH = path.join(
    __dirname,
    AUTOPILOT_SLACK_SKILL_NAME,
    'SKILL.md',
);

let slackSkillPromise: Promise<AiAgentSkill> | undefined;

// The Slack tone skill is Autopilot-only, so it lives next to the service rather
// than in the built-in skills the chat agents list.
const loadSlackSkill = (): Promise<AiAgentSkill> => {
    if (!slackSkillPromise) {
        slackSkillPromise = fs.readFile(SLACK_SKILL_PATH, 'utf8').then(
            (raw) => {
                const { content, data } = matter(raw);
                return {
                    name: AUTOPILOT_SLACK_SKILL_NAME,
                    description:
                        typeof data.description === 'string'
                            ? data.description
                            : 'Slack tone of voice for Autopilot summaries',
                    body: content,
                    resources: [],
                };
            },
            (error: unknown) => {
                slackSkillPromise = undefined;
                throw error;
            },
        );
    }
    return slackSkillPromise;
};

export const loadAutopilotSkill = async (
    name: string,
    loadBuiltInSkill: LoadAgentSkillFn,
): Promise<AiAgentSkill | undefined> => {
    switch (name) {
        case AUTOPILOT_SLACK_SKILL_NAME:
            return loadSlackSkill();
        case AUTOPILOT_CHART_SKILL_NAME:
            return loadBuiltInSkill(name);
        default:
            return undefined;
    }
};
