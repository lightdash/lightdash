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
});

export type AgentSelectionResult = z.infer<typeof AgentSelectionSchema>;

/**
 * Builds a formatted description for a single agent.
 */
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

/**
 * Builds formatted descriptions for all agents.
 *
 * @param agents - Array of agents to describe
 * @returns Formatted descriptions joined by double newlines
 */
function buildAgentDescriptions(agents: AiAgentWithContext[]): string {
    return agents
        .map((agent, index) => buildAgentDescription(agent, index))
        .join('\n\n');
}

/**
 * Uses an LLM to select the most appropriate agent for a given user query.
 */
export async function selectBestAgent(
    model: LanguageModel,
    agents: AiAgentWithContext[],
    userQuery: string,
): Promise<AgentSelectionResult> {
    if (agents.length === 0) {
        throw new Error('No agents available for selection');
    }

    if (agents.length === 1) {
        return {
            agentUuid: agents[0].uuid,
            reasoning: 'Only one agent available',
            confidence: 'high',
        };
    }

    const agentDescriptions = buildAgentDescriptions(agents);

    const result = await generateObject({
        model,
        schema: AgentSelectionSchema,
        messages: [
            {
                role: 'system',
                content: `You are an intelligent agent router for a data analytics platform. Your job is to select the most appropriate AI agent to handle a user's query.

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
${agentDescriptions}

Selection Guidelines:
- Choose the agent whose specialization best matches the query topic
- Prioritize agents with relevant data access (explores)
- Consider agents that have answered similar questions before
- If no perfect match, choose the most general-purpose agent
- Be confident in your choice, but indicate lower confidence if the match is uncertain

You must select exactly ONE agent from the list above by providing its exact UUID.`,
            },
            {
                role: 'user',
                content: `User Query: "${userQuery}"

Please select the best agent to handle this query and explain your reasoning.`,
            },
        ],
        temperature: 0.2,
    });

    return result.object;
}

/**
 * Helper function to select an agent and return the full agent context.
 */
export async function selectBestAgentWithContext(
    model: LanguageModel,
    agents: AiAgentWithContext[],
    userQuery: string,
): Promise<{
    agent: AiAgentWithContext;
    selection: AgentSelectionResult;
}> {
    const selection = await selectBestAgent(model, agents, userQuery);

    const selectedAgent = agents.find(
        (agent) => agent.uuid === selection.agentUuid,
    );

    if (!selectedAgent) {
        return {
            agent: agents[0],
            selection: {
                agentUuid: agents[0].uuid,
                reasoning: `Selected agent "${selection.agentUuid}" not found. Defaulting to first available agent.`,
                confidence: 'low',
            },
        };
    }

    return {
        agent: selectedAgent,
        selection,
    };
}
