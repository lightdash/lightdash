import {
    loadSkillToolDefinition,
    type ToolLoadSkillArgs,
    type ToolLoadSkillStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { LoadAgentSkillFn } from '../types/aiAgentDependencies';
import {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = { loadSkill: LoadAgentSkillFn };

type LoadSkillResult =
    | ExecuteStructuredToolResult<ToolLoadSkillStructuredContent>
    | ExecuteToolErrorResult;

const formatResourceList = (
    resources: Array<{ name: string; description: string }>,
): string =>
    resources.length > 0
        ? resources
              .map((resource) => `- ${resource.name}: ${resource.description}`)
              .join('\n')
        : '- No resources available for this skill.';

const errorResult = (result: string): ExecuteToolErrorResult => ({
    result,
    metadata: { status: 'error' },
    structuredContent: { error: result },
});

const toolDefinition = loadSkillToolDefinition.for('agent');

export const executeLoadSkill = async (
    { name, resourceName }: ToolLoadSkillArgs,
    { loadSkill }: Dependencies,
): Promise<LoadSkillResult> => {
    try {
        const skill = await loadSkill(name);

        if (!skill) {
            return errorResult(`Skill "${name}" was not found.`);
        }

        const resources = (skill.resources ?? []).map((resource) => ({
            name: resource.name,
            description: resource.description,
        }));

        if (resourceName) {
            const resource = skill.resources?.find(
                (item) =>
                    item.name.toLowerCase() ===
                    resourceName.trim().toLowerCase(),
            );

            if (!resource) {
                return errorResult(`Resource "${resourceName}" was not found for skill "${skill.name}".

Available resources:
${formatResourceList(resources)}`);
            }

            const loaded = {
                skill: skill.name,
                resource: {
                    name: resource.name,
                    content: resource.content.trim(),
                },
            };
            return {
                result: `# Resource: ${loaded.resource.name}

Skill: ${loaded.skill}

${loaded.resource.content}`,
                metadata: { status: 'success' },
                structuredContent: { kind: 'resource', ...loaded },
            };
        }

        const loaded = {
            skill: skill.name,
            body: skill.body.trim(),
            resources,
        };
        return {
            result: `# Skill: ${loaded.skill}

${loaded.body}

## Available Resources

${formatResourceList(loaded.resources)}`,
            metadata: { status: 'success' },
            structuredContent: { kind: 'skill', ...loaded },
        };
    } catch (error) {
        return toolErrorOutput(error, 'Error loading skill');
    }
};

export const getLoadSkill = (dependencies: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: (args) => executeLoadSkill(args, dependencies),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
