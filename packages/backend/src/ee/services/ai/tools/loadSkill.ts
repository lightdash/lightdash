import { loadSkillToolDefinition } from '@lightdash/common';
import { tool, type ModelMessage } from 'ai';
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

const loadedSkillKey = (name: string, resourceName: string | null): string =>
    resourceName
        ? `${name.trim().toLowerCase()}/${resourceName.trim().toLowerCase()}`
        : name.trim().toLowerCase();

const toolResultText = (output: unknown): string | null => {
    if (!output || typeof output !== 'object' || !('type' in output)) {
        return null;
    }
    const { type } = output;
    const value = 'value' in output ? output.value : null;
    if (type === 'text' && typeof value === 'string') return value;
    if (type !== 'json') return null;
    if (typeof value === 'string') return value;
    // Fast-decision replays wrap the text as `{ result, status }`.
    return value &&
        typeof value === 'object' &&
        'result' in value &&
        typeof value.result === 'string'
        ? value.result
        : null;
};

/**
 * Skills and resources whose full text is still in the history the model
 * sees. Compaction trims the history first, so a compacted copy no longer
 * counts and the next call loads it again.
 */
export const getLoadedSkillKeys = (
    messageHistory: ModelMessage[],
): Set<string> => {
    const requested = new Map<string, string>();
    for (const message of messageHistory) {
        if (
            message.role === 'assistant' &&
            typeof message.content !== 'string'
        ) {
            for (const part of message.content) {
                if (
                    part.type === 'tool-call' &&
                    part.toolName === 'loadSkill'
                ) {
                    const input = part.input as {
                        name?: unknown;
                        resourceName?: unknown;
                    } | null;
                    if (input && typeof input.name === 'string') {
                        requested.set(
                            part.toolCallId,
                            loadedSkillKey(
                                input.name,
                                typeof input.resourceName === 'string'
                                    ? input.resourceName
                                    : null,
                            ),
                        );
                    }
                }
            }
        }
    }
    const servedKeys = messageHistory.flatMap((message) =>
        message.role === 'tool'
            ? message.content.flatMap((part) => {
                  const key =
                      part.type === 'tool-result'
                          ? requested.get(part.toolCallId)
                          : undefined;
                  const text =
                      part.type === 'tool-result'
                          ? toolResultText(part.output)
                          : null;
                  return key &&
                      text &&
                      (text.startsWith('# Skill: ') ||
                          text.startsWith('# Resource: '))
                      ? [key]
                      : [];
              })
            : [],
    );
    return new Set(servedKeys);
};

export const getLoadSkill = ({
    loadSkill,
    loadedSkillKeys = new Set<string>(),
}: {
    loadSkill: LoadAgentSkillFn;
    /** Mutated as the run loads skills, so one run never serves the same text twice. */
    loadedSkillKeys?: Set<string>;
}) =>
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

                    const resourceKey = loadedSkillKey(
                        skill.name,
                        resource.name,
                    );
                    if (loadedSkillKeys.has(resourceKey)) {
                        return {
                            result: `Resource "${resource.name}" of skill "${skill.name}" is already loaded earlier in this thread; follow that loadSkill result.`,
                            metadata: {
                                status: 'success' as const,
                                skill: skill.metadata,
                            },
                            structuredContent: {
                                kind: 'already_loaded' as const,
                                skill: skill.name,
                                resource: resource.name,
                            },
                        };
                    }
                    loadedSkillKeys.add(resourceKey);

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

                const skillKey = loadedSkillKey(skill.name, null);
                if (loadedSkillKeys.has(skillKey)) {
                    return {
                        result: `Skill "${skill.name}" is already loaded earlier in this thread; follow that loadSkill result and call loadSkill only for its resources.`,
                        metadata: {
                            status: 'success' as const,
                            skill: skill.metadata,
                        },
                        structuredContent: {
                            kind: 'already_loaded' as const,
                            skill: skill.name,
                            resource: null,
                        },
                    };
                }
                loadedSkillKeys.add(skillKey);

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
