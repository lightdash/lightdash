import { AiAgentWithContext } from '@lightdash/common';
import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';

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
    selectedAgentUuid: string;
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
    metadata = {},
}: {
    model: LanguageModel;
    candidates: AiAgentWithContext[];
    prompt: string;
    instructions?: string | null;
    metadata?: Record<string, string>;
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

    const systemPrompt = ROUTER_SYSTEM_PROMPT.replace(
        '{{candidates}}',
        buildAgentDescriptions(candidates),
    ).replace(
        '{{adminInstructions}}',
        buildAdminInstructionsSection(instructions),
    );

    const result = await generateObject({
        model,
        schema: AgentSelectionSchema,
        experimental_telemetry: {
            functionId: 'selectAgent',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `User Query: "${prompt}"\n\nPlease select the best agent to handle this query and explain your reasoning.`,
            },
        ],
    });

    const selection = result.object;
    const exists = candidates.some((c) => c.uuid === selection.agentUuid);

    if (!exists) {
        return {
            selectedAgentUuid: candidates[0].uuid,
            reasoning: `Selected agent "${selection.agentUuid}" not found. Defaulting to first available agent.`,
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
