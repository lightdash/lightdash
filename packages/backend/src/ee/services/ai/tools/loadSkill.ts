import { loadSkillToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { AiAgentSkill } from '../skills/types';
import { LoadAgentSkillFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const formatResourceList = (
    resources: Array<{ name: string; description: string }>,
): string =>
    resources.length > 0
        ? resources
              .map((resource) => `- ${resource.name}: ${resource.description}`)
              .join('\n')
        : '- No resources available for this skill.';

/** The tool result text for a whole skill; the slash-command path writes the same text. */
export const formatSkillResult = (
    skill: Pick<AiAgentSkill, 'name' | 'body' | 'resources'>,
): string => `# Skill: ${skill.name}

${skill.body.trim()}

## Available Resources

${formatResourceList(
    skill.resources?.map((resource) => ({
        name: resource.name,
        description: resource.description,
    })) ?? [],
)}`;

const toolDefinition = loadSkillToolDefinition.for('agent');

export const getLoadSkill = ({ loadSkill }: { loadSkill: LoadAgentSkillFn }) =>
    tool({
        ...toolDefinition,
        execute: async ({ name, resourceName, arguments: argumentsText }) => {
            try {
                const skill = await loadSkill(name, {
                    arguments: argumentsText ?? null,
                });

                if (!skill) {
                    return {
                        result: `Skill "${name}" was not found.`,
                        metadata: {
                            status: 'error' as const,
                        },
                    };
                }

                if (resourceName) {
                    const resource = skill.resources?.find(
                        (item) =>
                            item.name.toLowerCase() ===
                            resourceName.trim().toLowerCase(),
                    );

                    if (!resource) {
                        return {
                            result: `Resource "${resourceName}" was not found for skill "${skill.name}".

Available resources:
${formatResourceList(
    skill.resources?.map((item) => ({
        name: item.name,
        description: item.description,
    })) ?? [],
)}`,
                            metadata: {
                                status: 'error' as const,
                            },
                        };
                    }

                    return {
                        result: `# Resource: ${resource.name}

Skill: ${skill.name}

${resource.content.trim()}`,
                        metadata: {
                            status: 'success' as const,
                            skill: skill.metadata,
                        },
                    };
                }

                return {
                    result: formatSkillResult(skill),
                    metadata: {
                        status: 'success' as const,
                        skill: skill.metadata,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error loading skill'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
