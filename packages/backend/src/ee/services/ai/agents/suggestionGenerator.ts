import {
    AGENT_SUGGESTION_ACTIONS,
    AGENT_SUGGESTION_TOOLS,
    agentSuggestionsModelSchema,
    type AgentSuggestion,
    type AgentSuggestionsModelObject,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { GeneratorModelOptions } from '../models/types';

const EMPTY_STATE_PROMPT = `You write 3-6 starter "chips" that appear above an empty AI agent chat input in a business-intelligence tool.

Each chip is a concrete, executable question or task that a new user could click to get value from the agent immediately. Chips are not autocomplete — they are billboards for what the agent can do.

Hard rules:
- Always emit chips with kind="prompt". Action chips are not valid in empty-state.
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

const POST_RESPONSE_PROMPT = `You write 2-5 chips that appear above the chat input AFTER the agent has just replied. Each chip is what the user is most likely to click NEXT in this conversation.

You have three chip kinds:

1. ANSWER (kind="prompt") — emit when <thread.latestAssistantTurn.askedClarifyingQuestion> is true. The label IS the user's likely answer back to the agent's question. 5-40 chars typically. Pull options from the choices the agent presented.

2. CONTINUE (kind="prompt") — a natural next prompt (drill-in, refinement, comparison, follow-up). Use ONLY field labels visible in <thread.latestAssistantTurn.latestQuery> or <explores>. Never invent terms — if a concept does not appear in the data, do not propose it.

3. ACTION (kind="action") — only when <thread.latestAssistantTurn.chartArtifactPresent> is true. At most ONE per response. Action chips trigger a UI workflow and do NOT submit text. Pick from: ${AGENT_SUGGESTION_ACTIONS.join(', ')}. The server binds the artifact reference — you only declare the action type.

HARD RULES:
- Never reference a field name, segment, tier, or metric that does not appear in <explores> or <thread.latestAssistantTurn.latestQuery>. This is the #1 failure mode.
- If <thread.latestAssistantTurn.refused> is true (the agent just said it couldn't do something): do NOT repeat the refused line. Pivot — propose a different explore, a related verified question, or an adjacent angle the data actually supports.
- 3 chips is ideal. 5 is the maximum. Density matters on a small chip row.
- Verified questions and content tags reflect the user's curated workflow — prefer them when they fit the next-step slot.
- No trailing punctuation on labels. Imperative or interrogative tense.

MODE SELECTION:
- If <thread.latestAssistantTurn.askedClarifyingQuestion> is true → lead with 2-4 ANSWER chips.
- Else if <thread.latestAssistantTurn.chartArtifactPresent> is true AND not refused → mostly CONTINUE chips + ONE ACTION chip.
- Else if refused → CONTINUE chips that PIVOT. No action chips.
- Else → CONTINUE chips only.

TOOL GUIDE (for kind="prompt"):
- \`runQuery\`: drill-ins, breakdowns, refinements of the data
- \`runSql\`: rare; only when semantic layer can't express what's being asked
- \`generateDashboard\`: "build me an overview" or multi-chart
- \`findContent\`: "is there already a saved chart for this"
- \`proposeChange\`: when the user is implicitly asking for a metric/dimension definition change

For each prompt chip, set defaults.explore, defaults.dimensions, defaults.timeframe based on what the chip implies. Use nulls / empty arrays when not applicable.`;

export const SUGGESTION_FALLBACK_CHIPS: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Show me what data is available',
        tool: 'findContent',
        defaults: { explore: null, dimensions: [], timeframe: null },
    },
    {
        kind: 'prompt',
        label: 'Summarise activity from the last 30 days',
        tool: 'runQuery',
        defaults: { explore: null, dimensions: [], timeframe: 'last 30 days' },
    },
    {
        kind: 'prompt',
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
    // Present only for post-response calls. When omitted, the empty-state
    // system prompt is used and the result is starter chips.
    thread?: {
        recentMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
        latestAssistantTurn: {
            text: string;
            askedClarifyingQuestion: boolean;
            refused: boolean;
            latestQuery: {
                exploreLabel: string;
                dimensions: string[];
                metrics: string[];
            } | null;
            chartArtifactPresent: boolean;
        };
    };
};

export async function generateAgentSuggestions(
    modelOptions: GeneratorModelOptions,
    context: SuggestionPromptContext,
    metadata: Record<string, string> = {},
): Promise<AgentSuggestionsModelObject> {
    const isPostResponse = context.thread !== undefined;

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
            thread: context.thread ?? null,
        },
        null,
        2,
    );

    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: agentSuggestionsModelSchema,
        messages: [
            {
                role: 'system',
                content: isPostResponse
                    ? POST_RESPONSE_PROMPT
                    : EMPTY_STATE_PROMPT,
            },
            {
                role: 'user',
                content: isPostResponse
                    ? `Generate post-response chips for this conversation.\n\nContext:\n${userContent}`
                    : `Generate empty-state suggestion chips for this agent.\n\nContext:\n${userContent}`,
            },
        ],
        experimental_telemetry: {
            functionId: 'generateAgentSuggestions',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata: {
                ...metadata,
                mode: isPostResponse ? 'post-response' : 'empty-state',
            },
        },
    });

    return result.object;
}
