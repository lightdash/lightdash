import { tool } from 'ai';
import { z } from 'zod';
import { LoadAgentSkillFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolLoadSkillArgsSchema = z
    .object({
        name: z
            .string()
            .min(1)
            .describe('Exact name of the built-in skill to load.'),
        resourceName: z
            .string()
            .min(1)
            .nullable()
            .describe(
                'Optional sub-resource file name to load from the skill. You can find names of sub-resources by first loading the skill without this parameter.',
            ),
    })
    .describe(
        "Load a built-in skill by name, One of it's sub-resources. Always start by loading the skill itself and then load resources on demand",
    );

const toolLoadSkillOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

const formatResourceList = (
    resources: Array<{ name: string; description: string }>,
): string =>
    resources.length > 0
        ? resources
              .map((resource) => `- ${resource.name}: ${resource.description}`)
              .join('\n')
        : '- No resources available for this skill.';

export const getLoadSkill = ({ loadSkill }: { loadSkill: LoadAgentSkillFn }) =>
    tool({
        description: toolLoadSkillArgsSchema.description,
        inputSchema: toolLoadSkillArgsSchema,
        outputSchema: toolLoadSkillOutputSchema,
        execute: async ({ name, resourceName }) => {
            try {
                const skill = await loadSkill(name);

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
                        },
                    };
                }

                return {
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
                    result: toolErrorHandler(error, 'Error loading skill'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
