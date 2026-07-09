import { loadSkillToolDefinition } from '@lightdash/common';
import { LoadAgentSkillFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const formatResourceList = (
    resources: Array<{ name: string; description: string }>,
): string =>
    resources.length > 0
        ? resources
              .map((resource) => `- ${resource.name}: ${resource.description}`)
              .join('\n')
        : '- No resources available for this skill.';

const toolDefinition = loadSkillToolDefinition.for('ai-sdk');

export const getLoadSkill = ({ loadSkill }: { loadSkill: LoadAgentSkillFn }) =>
    toolDefinition.build({
        execute: async ({ name, resourceName }) => {
            try {
                const skill = await loadSkill(name);

                if (!skill) {
                    return {
                        status: 'error' as const,
                        error: `Skill "${name}" was not found.`,
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
                            status: 'error' as const,
                            error: `Resource "${resourceName}" was not found for skill "${skill.name}".

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
                        status: 'success' as const,
                        type: 'string' as const,
                        result: `# Resource: ${resource.name}

Skill: ${skill.name}

${resource.content.trim()}`,
                        metadata: {
                            status: 'success' as const,
                        },
                    };
                }

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: `# Skill: ${skill.name}

${skill.body.trim()}

## Available Resources

${formatResourceList(
    skill.resources?.map((resource) => ({
        name: resource.name,
        description: resource.description,
    })) ?? [],
)}`,
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(error, 'Error loading skill'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });
