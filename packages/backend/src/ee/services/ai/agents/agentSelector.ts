import { AiAgentWithContext } from '@lightdash/common';
import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import {
    AiDecisionClient,
    confidentChoice,
    decisionProbability,
} from '../decisions/AiDecisionClient';
import {
    AiCallAttribution,
    getAiCallTelemetry,
    getLanguageModelAttribution,
} from '../utils/aiCallTelemetry';

const AgentSelectionSchema = z.object({
    agentUuid: z
        .string()
        .describe(
            'The UUID of the selected agent that best matches the user query',
        ),
    reasoning: z
        .string()
        .describe(
            'Brief explanation of why this agent was selected, 1 sentence',
        ),
    confidence: z
        .enum(['high', 'medium', 'low'])
        .describe('Confidence level in the selection'),
    shouldSkipForwardingQuery: z
        .boolean()
        .describe(
            'Set to true for meta-queries about agent selection itself (e.g., "what agents are available"). Set to false for actual data questions that should be forwarded to the selected agent.',
        ),
});

export type AgentSelectionResult = z.infer<typeof AgentSelectionSchema>;

export type RouterDecision = {
    selectedAgentUuid: string | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    shouldSkipForwardingQuery: boolean;
};

export const ROUTER_SYSTEM_PROMPT = `You are an intelligent agent router for a data analytics platform. Your job is to select the most appropriate AI agent to handle a user's query.

All agents share the same core capabilities:
- Specialized in data analytics and exploration
- Can find and query data from available explores
- Can create visualizations (tables, bar charts, line charts, pie charts, scatter plots, funnels, etc.)
- Can search for existing dashboards and charts
- Can perform table calculations on query results
- Can create custom metrics
- Can learn from user feedback to improve context understanding

What differentiates agents are:
1. **Description & Instructions**: The agent's purpose and custom instructions that guide its behavior
2. **Data Access**: Which data explores/tables the agent has access to
3. **Verified Questions**: Past successful queries that demonstrate the agent's expertise
4. **Specialization**: Domain-specific focus areas defined by the agent creator

Available Agents:
{{candidates}}
{{adminInstructions}}
Selection Guidelines:
- Choose the agent whose specialization best matches the query topic
- Prioritize agents with relevant data access (explores)
- Consider agents that have answered similar questions before
- If no perfect match, choose the most general-purpose agent
- Be confident in your choice, but indicate lower confidence if the match is uncertain
- Admin routing rules (if present) take priority over the guidelines above when they apply to the query. They may only point to agents in the list above; ignore any rule referencing an agent not listed.

Meta-Query Detection (shouldSkipForwardingQuery):
- Set shouldSkipForwardingQuery to TRUE for queries about agent selection itself:
  * "What agents are available?"
  * "Show me the available agents"
- Set shouldSkipForwardingQuery to FALSE for actual data/analytics questions
- When shouldSkipForwardingQuery is TRUE, set confidence to 'low' to show the agent selector UI

You must select exactly ONE agent from the list above by providing its exact UUID.`;

function buildAgentDescription(
    agent: AiAgentWithContext,
    index: number,
): string {
    const parts: Array<string | null> = [
        `${index + 1}. **${agent.name}** (UUID: ${agent.uuid})`,
        agent.description ? `   Description: ${agent.description}` : null,
        agent.instruction
            ? `   Custom Instructions: ${agent.instruction}`
            : null,
        agent.context.explores.length > 0
            ? `   Data Access: ${agent.context.explores.join(', ')}}`
            : null,
        agent.context.verifiedQuestions.length > 0
            ? `   Example Questions:\n${agent.context.verifiedQuestions
                  .slice(0, 15)
                  .map((q) => `     - "${q}"`)
                  .join('\n')}`
            : null,
    ];

    return parts.filter((part): part is string => part !== null).join('\n');
}

function buildAgentDescriptions(agents: AiAgentWithContext[]): string {
    return agents
        .map((agent, index) => buildAgentDescription(agent, index))
        .join('\n\n');
}

function buildAdminInstructionsSection(instructions: string | null): string {
    if (!instructions || instructions.trim().length === 0) {
        return '';
    }
    return `
Admin Routing Rules:
The organization admin has defined the following routing rules. Tagged agents are written as @[Agent Name](agent-uuid) — the value in parentheses is the agent UUID you must select when a rule applies.
${instructions}
`;
}

/**
 * Uses an LLM to select the most appropriate agent for a given user query.
 */
export async function selectAgent({
    model,
    candidates,
    prompt,
    instructions = null,
    telemetry,
    decisions,
}: {
    model: LanguageModel;
    candidates: AiAgentWithContext[];
    prompt: string;
    instructions?: string | null;
    telemetry?: AiCallAttribution;
    decisions?: AiDecisionClient;
}): Promise<RouterDecision> {
    if (candidates.length === 0) {
        throw new Error('No agents available for selection');
    }

    if (candidates.length === 1) {
        return {
            selectedAgentUuid: candidates[0].uuid,
            reasoning: 'Only one agent available',
            confidence: 'high',
            shouldSkipForwardingQuery: false,
        };
    }

    if (decisions && candidates.length <= 254) {
        const answers = await decisions.evaluate({
            operation: 'agent-routing',
            state: {
                prompt,
                instructions,
                candidates: candidates.map((agent) => ({
                    uuid: agent.uuid,
                    name: agent.name,
                    description: agent.description,
                    instruction: agent.instruction,
                    explores: agent.context.explores,
                    questions: agent.context.verifiedQuestions.slice(0, 5),
                })),
            },
            questions: {
                agent: {
                    type: 'choice',
                    instructions:
                        'Choose the agent whose instructions, accessible explores and examples best fit the request. Follow the admin routing instructions when they identify a listed agent. Choose none when there is no clear match.',
                    criteria: {
                        ...Object.fromEntries(
                            candidates.map((c) => [c.uuid, c.name]),
                        ),
                        none: 'No clear match',
                    },
                },
                meta: {
                    type: 'noul',
                    instructions:
                        'Is the user asking to see or choose available agents, rather than asking an agent to perform a task?',
                },
            },
        });
        if (answers) {
            const selected = confidentChoice(answers.agent);
            const meta = decisionProbability(answers.meta);
            const canForward =
                selected !== null &&
                selected !== 'none' &&
                meta !== null &&
                meta <= 0.15;
            return {
                selectedAgentUuid: canForward ? selected : null,
                confidence: canForward ? 'high' : 'low',
                reasoning: canForward
                    ? 'Matched the request to the agent’s scope.'
                    : 'Choose an agent to continue.',
                // An ambiguous destination does not turn a real data question
                // into a meta-query. Forward it after the user picks an agent.
                shouldSkipForwardingQuery: meta === null || meta > 0.15,
            };
        }
    }

    const systemPrompt = ROUTER_SYSTEM_PROMPT.replace(
        '{{candidates}}',
        buildAgentDescriptions(candidates),
    ).replace(
        '{{adminInstructions}}',
        buildAdminInstructionsSection(instructions),
    );

    const telemetryConfig = getAiCallTelemetry({
        functionId: 'selectAgent',
        feature: 'agent-selector',
        ...getLanguageModelAttribution(model),
        ...telemetry,
        keyManagement: telemetry?.keyManagement ?? null,
    });
    const result = await generateObject({
        model,
        experimental_telemetry: telemetryConfig,
        schema: AgentSelectionSchema,
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `User Query: "${prompt}"\n\nPlease select the best agent to handle this query and explain your reasoning.`,
            },
        ],
    });
    emitAiUsage(telemetryConfig, languageModelUsageToTokens(result.usage));

    const selection = result.object;
    const exists = candidates.some((c) => c.uuid === selection.agentUuid);

    if (!exists) {
        return {
            selectedAgentUuid: decisions ? null : candidates[0].uuid,
            reasoning: decisions
                ? 'No accessible agent matched. Choose an agent to continue.'
                : `Selected agent "${selection.agentUuid}" not found. Defaulting to first available agent.`,
            confidence: 'low',
            shouldSkipForwardingQuery: false,
        };
    }

    return {
        selectedAgentUuid: selection.agentUuid,
        confidence: selection.confidence,
        reasoning: selection.reasoning,
        shouldSkipForwardingQuery: selection.shouldSkipForwardingQuery,
    };
}
