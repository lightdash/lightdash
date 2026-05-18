import {
    AGENT_SUGGESTION_TOOLS,
    agentSuggestionsSchema,
    type AgentSuggestion,
    type AgentSuggestionsObject,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { GeneratorModelOptions } from '../models/types';

const SYSTEM_PROMPT = `You write 3-6 starter "chips" that appear above an empty AI agent chat input in a business-intelligence tool.

Each chip is a concrete, executable question or task that a new user could click to get value from the agent immediately. Chips are not autocomplete — they are billboards for what the agent can do.

Hard rules:
- Each label is 5-120 characters, imperative or interrogative, no trailing punctuation.
- Each chip MUST pick exactly one of these tools: ${AGENT_SUGGESTION_TOOLS.join(', ')}.
- Use real explore and dimension names from the catalogue. Never invent fields.
- Mix tools when possible — avoid producing only \`runQuery\` chips.
- Prefer verified questions and content tags when supplied — that's the user's curated context.

Tool guide:
- \`runQuery\`: factual data questions answerable from the semantic layer ("Show revenue by week for last 90 days").
- \`runSql\`: anything that needs warehouse-direct SQL (rare; only when the question can't be expressed in the semantic layer).
- \`generateDashboard\`: when the value is a multi-chart overview ("Build me an executive summary").
- \`findContent\`: when an existing chart or dashboard likely already answers it ("Find the weekly sales report").
- \`proposeChange\`: when the user is implicitly asking for a metric/dimension definition change.

If the project has zero explores, return three generic chips that prompt the user to set up data (e.g. "Show me what data is available").`;

export const SUGGESTION_FALLBACK_CHIPS: AgentSuggestion[] = [
    {
        label: 'Show me what data is available',
        tool: 'findContent',
        defaults: { explore: null, dimensions: [], timeframe: null },
    },
    {
        label: 'Summarise activity from the last 30 days',
        tool: 'runQuery',
        defaults: { explore: null, dimensions: [], timeframe: 'last 30 days' },
    },
    {
        label: 'Build a quick overview dashboard',
        tool: 'generateDashboard',
        defaults: { explore: null, dimensions: [], timeframe: null },
    },
];

export type SuggestionPromptContext = {
    agentName: string;
    agentInstruction: string | null;
    enabledTools: readonly string[];
    explores: Array<{
        name: string;
        label: string;
        description: string | null;
        dimensions: string[];
        metrics: string[];
    }>;
    verifiedQuestions: string[];
    verifiedContentTags: string[];
};

export async function generateAgentSuggestions(
    modelOptions: GeneratorModelOptions,
    context: SuggestionPromptContext,
    metadata: Record<string, string> = {},
): Promise<AgentSuggestionsObject> {
    const userContent = JSON.stringify(
        {
            agent: {
                name: context.agentName,
                instruction: context.agentInstruction,
            },
            enabledTools: context.enabledTools,
            explores: context.explores,
            verifiedQuestions: context.verifiedQuestions,
            verifiedContentTags: context.verifiedContentTags,
        },
        null,
        2,
    );

    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: agentSuggestionsSchema,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Generate suggestion chips for this agent.\n\nContext:\n${userContent}`,
            },
        ],
        experimental_telemetry: {
            functionId: 'generateAgentSuggestions',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
    });

    return result.object;
}
