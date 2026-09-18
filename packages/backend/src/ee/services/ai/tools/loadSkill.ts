import { loadSkillToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { AiAgentSkill } from '../skills/types';
import { LoadAgentSkillFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

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
                        structuredContent: {
                            error: `Skill "${name}" was not found.`,
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
                        // One string, two views: the structured error must
                        // carry exactly what the text tells the model.
                        const result = `Resource "${resourceName}" was not found for skill "${skill.name}".

Available resources:
${formatResourceList(
    skill.resources?.map((item) => ({
        name: item.name,
        description: item.description,
    })) ?? [],
)}`;
                        return {
                            result,
                            metadata: {
                                status: 'error' as const,
                            },
                            structuredContent: { error: result },
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
                        structuredContent: {
                            kind: 'resource',
                            skill: skill.name,
                            resource: {
                                name: resource.name,
                                content: resource.content.trim(),
                            },
                        },
                    };
                }

                return {
                    result: formatSkillResult(skill),
                    metadata: {
                        status: 'success' as const,
                        skill: skill.metadata,
                    },
                    structuredContent: {
                        kind: 'skill',
                        skill: skill.name,
                        body: skill.body.trim(),
                        resources:
                            skill.resources?.map((item) => ({
                                name: item.name,
                                description: item.description,
                            })) ?? [],
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error loading skill');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
