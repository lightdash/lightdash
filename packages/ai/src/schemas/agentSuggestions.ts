import { type ApiSuccess } from '@lightdash/common';
import { z } from 'zod';
import { AGENT_SUGGESTION_TOOLS, type AgentSuggestion } from '../types';

const promptChipModelSchema = z.object({
    kind: z.literal('prompt'),
    label: z
        .string()
        .min(5)
        .max(120)
        .describe(
            'Concrete, executable question the agent could answer. Imperative or interrogative tense. No trailing punctuation.',
        ),
    tool: z
        .enum(AGENT_SUGGESTION_TOOLS)
        .describe(
            'Best-fit tool for this chip. Used as a soft hint to bias the agent toward the right tool on the next turn.',
        ),
    defaults: z
        .object({
            explore: z
                .string()
                .nullable()
                .describe(
                    'Name of the explore the chip implies. Null when the chip is not explore-specific.',
                ),
            dimensions: z
                .array(z.string())
                .describe(
                    'Field IDs the chip implies. Empty array when the chip does not pin dimensions.',
                ),
            metrics: z
                .array(z.string())
                .describe(
                    'Metric field IDs the chip implies. Empty array when the chip does not pin metrics.',
                ),
            timeframe: z
                .string()
                .nullable()
                .describe(
                    'Human-readable timeframe (e.g. "last 30 days"). Null when not time-bound.',
                ),
        })
        .describe('Structured payload accompanying the chip label.'),
});

// Navigate chips are only valid for empty-state suggestions and only point at
// threads the user authored. The model emits an index into the
// recentUserConversations array supplied in the user message; the server
// resolves that index to a thread UUID and builds a URL post-generation.
const navigateChipModelSchema = z.object({
    kind: z.literal('navigate'),
    label: z
        .string()
        .min(5)
        .max(120)
        .describe(
            'Short navigation label, e.g. "Continue your funnel conversion analysis". No trailing punctuation.',
        ),
    recentConversationIndex: z
        .number()
        .int()
        .min(0)
        .max(10)
        .describe(
            'Index into recentUserConversations identifying the thread to open. The server resolves this to a real URL — you do not need to know UUIDs.',
        ),
});

export const agentSuggestionsModelSchema = z.object({
    chips: z
        .array(
            z.discriminatedUnion('kind', [
                promptChipModelSchema,
                navigateChipModelSchema,
            ]),
        )
        .min(2)
        .max(6)
        .describe('Between 2 and 6 suggestion chips.'),
});

export type AgentSuggestionsModelObject = z.infer<
    typeof agentSuggestionsModelSchema
>;

export type ApiAgentSuggestionsResponse = ApiSuccess<{
    chips: AgentSuggestion[];
}>;
