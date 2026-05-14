import { tool } from 'ai';
import { z } from 'zod';
import {
    LoadAgentSkillFn,
    LoadAgentSkillResourceFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolLoadSkillResourceArgsSchema = z
    .object({
        skillName: z
            .string()
            .min(1)
            .describe('Exact name of the skill that owns the resource.'),
        resourceName: z
            .string()
            .min(1)
            .describe('Exact markdown resource file name to load.'),
    })
    .describe(
        'Load one markdown resource from a built-in skill by skill name and resource file name.',
    );

const toolLoadSkillResourceOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

const formatAvailableResources = (
    resources: Array<{ name: string; description: string }>,
): string =>
    resources.length > 0
        ? resources
              .map((resource) => `- ${resource.name}: ${resource.description}`)
              .join('\n')
        : '- No resources available for this skill.';

export const getLoadSkillResource = ({
    loadSkill,
    loadSkillResource,
}: {
    loadSkill: LoadAgentSkillFn;
    loadSkillResource: LoadAgentSkillResourceFn;
}) =>
    tool({
        description: toolLoadSkillResourceArgsSchema.description,
        inputSchema: toolLoadSkillResourceArgsSchema,
        outputSchema: toolLoadSkillResourceOutputSchema,
        execute: async ({ skillName, resourceName }) => {
            try {
                const [skill, resource] = await Promise.all([
                    loadSkill(skillName),
                    loadSkillResource({ skillName, resourceName }),
                ]);

                if (!skill) {
                    return {
                        result: `Skill "${skillName}" was not found.`,
                        metadata: {
                            status: 'error' as const,
                        },
                    };
                }

                if (!resource) {
                    return {
                        result: `Resource "${resourceName}" was not found for skill "${skill.name}".

Available resources:
${formatAvailableResources(
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
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error loading skill resource',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
