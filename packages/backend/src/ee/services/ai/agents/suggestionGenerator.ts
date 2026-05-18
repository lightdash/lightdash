import {
    AGENT_SUGGESTION_TOOLS,
    agentSuggestionsModelSchema,
    type AgentSuggestion,
    type AgentSuggestionsModelObject,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { GeneratorModelOptions } from '../models/types';

const EMPTY_STATE_PROMPT = `You write 3-6 starter "chips" that appear above an empty AI agent chat input in a business-intelligence tool.

Every chip MUST be a data question or task the agent can act on by running a query, building a chart, or finding existing content. When the user clicks a chip its label is sent verbatim as their next message — so the label has to read as a complete prompt the agent can answer immediately.

Hard rules:
- Each label is 5-120 characters, imperative or interrogative, no trailing punctuation.
- Each chip MUST pick exactly one of these tools: ${AGENT_SUGGESTION_TOOLS.join(', ')}.
- Use real explore and dimension/metric labels from the catalogue. Never invent fields.
- Mix tools when possible — avoid producing only \`runQuery\` chips.

FORBIDDEN PATTERNS — clicking these does NOT actually navigate or update anything, so the chip would frustrate the user:
- "Continue the {topic}" / "Pick up where you left off" — there is no back-link to the prior thread.
- "Update the {dashboard}" / "Refresh the {chart}" — the agent can run queries and build artifacts, but it cannot edit a dashboard the user already saved.
- "Open the {name}" / "Show me the {chart}" — there is no navigation chip; we cannot deep-link to verified content.

Instead, treat recent conversations and verified content as TOPIC SIGNALS — they tell you what the user cares about. Use that to propose NEW, adjacent data questions in those topic areas:
- recentUserConversations: if the user has been digging into "product events", propose a NEW angle ("Compare conversion rate across product surfaces") rather than asking them to continue.
- verifiedContent: if there is a "Revenue Summary" verified chart, propose a fresh angle on revenue ("Break down revenue by month", "Compare revenue across regions") rather than asking them to open it.
- verifiedQuestions: these ARE complete prompts the agent can answer. Use them verbatim when they fit — they're the highest-quality chip you can produce.
- explores: catalog-driven question chips when no curated signal applies.

Tool guide:
- \`runQuery\`: factual data questions answerable from the semantic layer ("Show revenue by week for last 90 days").
- \`runSql\`: anything that needs warehouse-direct SQL (rare; only when the question can't be expressed in the semantic layer).
- \`generateDashboard\`: when the value is a multi-chart overview ("Build me an executive summary").
- \`findContent\`: when an existing chart or dashboard likely already answers a question the user might pose ("Is there already a chart for monthly revenue?").
- \`proposeChange\`: when the user is implicitly asking for a metric/dimension definition change.

If the project has zero explores AND no verified questions, return three generic chips that prompt the user to set up data.`;

const POST_RESPONSE_PROMPT = `You write 2-5 chips that appear above the chat input AFTER the agent has just replied. Each chip is what the user is most likely to click NEXT in this conversation.

You only emit prompt chips — actions like "save as chart" are handled elsewhere. Every chip submits a new message to the agent when clicked.

Two modes:

1. ANSWER mode — when <thread.latestAssistantTurn.askedClarifyingQuestion> is true, the chips ARE the user's likely answers to the agent's question. Pull options from the choices the agent presented in its reply. 5-40 chars typically.

2. CONTINUE mode — natural next prompts (drill-in, refinement, comparison, follow-up). Use ONLY field labels visible in <thread.latestAssistantTurn.latestQueryExplore> (preferred — these are the fields the agent JUST used), or in <thread.latestAssistantTurn.text>, or in <explores>. Never invent terms — if a concept doesn't appear in the data, do not propose it.

PREFERRED CONTEXT:
- When <thread.latestAssistantTurn.latestQueryExplore> is present, lean on its dimensions and metrics first. These are the fields the agent just touched — the user is almost certainly thinking in that explore's frame.
- defaults.explore for CONTINUE chips SHOULD match latestQueryExplore.name unless you are deliberately pivoting.

HARD RULES:
- Never reference a field name, segment, tier, or metric that does not appear in <thread.latestAssistantTurn.latestQueryExplore>, <explores>, <thread.latestAssistantTurn.text>, or <verifiedContent>. This is the #1 failure mode.
- If <thread.latestAssistantTurn.refused> is true (the agent just said it couldn't do something): do NOT repeat the refused line. Pivot — propose a different explore, a related verified question, or an adjacent angle the data actually supports.
- 3 chips is ideal. 5 is the maximum.
- Verified questions, verified content, and content tags reflect the user's curated workflow — prefer them when they fit the next-step slot. A chip that points at a verified chart ("Open the {name}") via \`findContent\` is often stronger than a new query.
- No trailing punctuation on labels. Imperative or interrogative tense.

For each chip, set defaults.explore, defaults.dimensions, defaults.timeframe based on what the chip implies. Use nulls / empty arrays when not applicable. Set tool to the best-fit value: ${AGENT_SUGGESTION_TOOLS.join(', ')}.

Tool guide:
- \`runQuery\`: drill-ins, breakdowns, refinements of the data
- \`runSql\`: rare; only when semantic layer can't express what's being asked
- \`generateDashboard\`: "build me an overview" or multi-chart
- \`findContent\`: "is there already a saved chart for this", or to surface a verified chart
- \`proposeChange\`: when the user is implicitly asking for a metric/dimension definition change`;

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

export type RecentUserConversation = {
    topic: string; // thread title or first user prompt snippet
    lastUserMessage: string | null;
    daysAgo: number;
};

export type VerifiedContentItem = {
    title: string;
    type: 'chart' | 'dashboard';
    description: string | null;
};

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
                dimensions: string[];
                metrics: string[];
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
            recentUserConversations: context.recentUserConversations ?? null,
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
