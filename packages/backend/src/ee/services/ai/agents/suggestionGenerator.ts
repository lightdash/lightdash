import {
    AGENT_SUGGESTION_TOOLS,
    agentSuggestionsModelSchema,
    type AgentSuggestion,
    type AgentSuggestionsModelObject,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { GeneratorModelOptions } from '../models/types';

const EMPTY_STATE_PROMPT = `You write 3-6 starter "chips" that appear above an empty AI agent chat input in a business-intelligence tool.

There are TWO chip kinds:

1. PROMPT chips (kind="prompt") — a complete data question the agent can act on by running a query, building a chart, or finding existing content. When clicked, the label is sent verbatim as the user's next message. Use only tools listed in <enabledTools>. Reference only real explore and dimension/metric labels from the catalogue. In defaults.dimensions and defaults.metrics, use field IDs from the catalogue, not labels.

2. NAVIGATE chips (kind="navigate") — open one of the user's own recent threads. ONLY emit these when <recentUserConversations> contains a thread the user might want to resume. Set recentConversationIndex to the array index (0 = most recent). The server resolves the URL. Label should make it clear the chip resumes a conversation, e.g. "Continue your funnel conversion analysis" or "Resume the visit analytics dashboard build". Don't write more than ONE navigate chip per response — keep the rest as fresh PROMPT chips.

Hard rules for both kinds:
- Each label is 5-120 characters, imperative or interrogative, no trailing punctuation.
- Never invent terms not present in the catalogue or the user's recent topics.
- Mix kinds and tools — a typical good response is 1 navigate chip + 3-4 prompt chips spanning at least two tools.

FORBIDDEN PROMPT-CHIP PATTERNS — these read like commands the agent cannot fulfil from a fresh thread:
- "Update the {dashboard}" / "Refresh the {chart}" — the agent can run queries and build new artifacts, but it cannot edit a saved dashboard.
- "Open the {chart}" / "Show me the {dashboard}" — there is no deep-link to verified content; if the user wants to see something, propose a PROMPT chip that asks the agent to find/rebuild it (use the findContent tool).

How to use the context (PROMPT chips):
- recentUserConversations: TOPIC SIGNAL. If the user has been digging into "product events", propose a NEW angle as a prompt chip ("Compare conversion rate across product surfaces"). For resumption, emit a navigate chip instead.
- verifiedContent: TOPIC SIGNAL. If there's a "Revenue Summary" verified chart, propose a fresh angle on revenue ("Break down revenue by month").
- verifiedQuestions: these ARE complete prompts. Use them verbatim as prompt chips when they fit — they're the highest-quality chip you can produce.
- explores: catalog-driven question chips when no curated signal applies.

Tool guide (PROMPT chips):
- \`generateVisualization\`: factual data questions answerable from the semantic layer.
- \`runSql\`: rare; only when present in <enabledTools> and the question can't be expressed in the semantic layer.
- \`generateDashboard\`: multi-chart overview ("Build me an executive summary").
- \`findContent\`: "Is there already a chart for monthly revenue?" — locates existing saved content.
- \`proposeChange\`: implicit metric/dimension definition change.

If the project has zero explores AND no verified questions AND no recent conversations, return three generic prompt chips that nudge the user to set up data.`;

const POST_RESPONSE_PROMPT = `You write 2-5 chips that appear above the chat input AFTER the agent has just replied. Each chip is what the user is most likely to click NEXT in this conversation.

Only emit chips with kind="prompt". Navigate chips are forbidden here — the user is already in this thread, so suggesting they jump elsewhere would interrupt the flow. Actions like "save as chart" are handled elsewhere. Every chip submits a new message to the agent when clicked.

Two modes:

1. ANSWER mode — when <thread.latestAssistantTurn.askedClarifyingQuestion> is true, the chips ARE the user's likely answers to the agent's question. Pull options from the choices the agent presented in its reply. 5-40 chars typically.

2. CONTINUE mode — natural next prompts (drill-in, refinement, comparison, follow-up). Use ONLY field labels visible in <thread.latestAssistantTurn.latestQueryExplore> (preferred — these are the fields the agent JUST used), or in <thread.latestAssistantTurn.text>, or in <explores>. Never invent terms — if a concept doesn't appear in the data, do not propose it. In defaults.dimensions and defaults.metrics, use field IDs from the catalogue, not labels.

PREFERRED CONTEXT:
- When <thread.latestAssistantTurn.latestQueryExplore> is present, lean on its dimensions and metrics first. These are the fields the agent just touched — the user is almost certainly thinking in that explore's frame.
- defaults.explore for CONTINUE chips SHOULD match latestQueryExplore.name unless you are deliberately pivoting.

HARD RULES:
- Never reference a field name, segment, tier, or metric that does not appear in <thread.latestAssistantTurn.latestQueryExplore>, <explores>, <thread.latestAssistantTurn.text>, or <verifiedContent>. This is the #1 failure mode.
- If <thread.latestAssistantTurn.refused> is true (the agent just said it couldn't do something): do NOT repeat the refused line. Pivot — propose a different explore, a related verified question, or an adjacent angle the data actually supports.
- 3 chips is ideal. 5 is the maximum.
- Verified questions, verified content, and content tags reflect the user's curated workflow — prefer them when they fit the next-step slot. A chip that points at a verified chart ("Find the {name} chart") via \`findContent\` is often stronger than a new query.
- No trailing punctuation on labels. Imperative or interrogative tense.

For each chip, set defaults.explore, defaults.dimensions, defaults.metrics, defaults.timeframe based on what the chip implies. Use nulls / empty arrays when not applicable. Set tool to the best-fit enabled tool from <enabledTools>.

Tool guide:
- \`generateVisualization\`: drill-ins, breakdowns, refinements of the data
- \`runSql\`: rare; only when present in <enabledTools> and semantic layer can't express what's being asked
- \`generateDashboard\`: "build me an overview" or multi-chart
- \`findContent\`: "is there already a saved chart for this", or to surface a verified chart
- \`proposeChange\`: when the user is implicitly asking for a metric/dimension definition change`;

export const SUGGESTION_FALLBACK_CHIPS: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Show me what data is available',
        tool: 'findContent',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
    {
        kind: 'prompt',
        label: 'Summarise activity from the last 30 days',
        tool: 'generateVisualization',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: 'last 30 days',
        },
    },
    {
        kind: 'prompt',
        label: 'Build a quick overview dashboard',
        tool: 'generateDashboard',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
];

export type RecentUserConversation = {
    topic: string; // thread title or first user prompt snippet
    lastUserMessage: string | null;
    daysAgo: number;
    // Server-only — used to resolve a navigate chip's URL after the LLM
    // emits it by index. NOT sent to the LLM.
    threadUuid: string;
};

export type VerifiedContentItem = {
    title: string;
    type: 'chart' | 'dashboard';
    description: string | null;
};

type SuggestionFieldContext = {
    id: string;
    label: string;
};

export type SuggestionPromptContext = {
    agentName: string;
    agentInstruction: string | null;
    enabledTools: readonly string[];
    explores: Array<{
        name: string;
        label: string;
        description: string | null;
        dimensions: SuggestionFieldContext[];
        metrics: SuggestionFieldContext[];
    }>;
    verifiedQuestions: string[];
    verifiedContentTags: string[];
    verifiedContent: VerifiedContentItem[];
    // Only set when generating empty-state chips. Lets the LLM pick up where
    // the user left off.
    recentUserConversations?: RecentUserConversation[];
    // Only set when generating post-response chips.
    thread?: {
        recentMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
        latestAssistantTurn: {
            text: string;
            askedClarifyingQuestion: boolean;
            refused: boolean;
            // The explore the agent actually queried on this turn. When
            // present, post-response chips should stay grounded in these
            // fields — much tighter than the full explore catalogue.
            latestQueryExplore: {
                name: string;
                label: string;
                description: string | null;
                dimensions: SuggestionFieldContext[];
                metrics: SuggestionFieldContext[];
            } | null;
        };
    };
};

export async function generateAgentSuggestions(
    modelOptions: GeneratorModelOptions,
    context: SuggestionPromptContext,
    metadata: Record<string, string> = {},
): Promise<AgentSuggestionsModelObject> {
    const isPostResponse = context.thread !== undefined;

    // Strip threadUuid from recent conversations before sending to the LLM —
    // the model only needs the topic and index (implied by array order). The
    // server uses threadUuid post-generation to resolve navigate chips.
    const recentForLLM = context.recentUserConversations?.map(
        ({ threadUuid: _, ...rest }) => rest,
    );

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
            verifiedContent: context.verifiedContent,
            recentUserConversations: recentForLLM ?? null,
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
