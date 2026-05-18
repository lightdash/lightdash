import { z } from 'zod';
import { type ApiSuccess } from '../../../types/api/success';
import {
    AGENT_SUGGESTION_ACTIONS,
    AGENT_SUGGESTION_TOOLS,
    type AgentSuggestion,
} from '../types';

const promptChipSchema = z.object({
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
            timeframe: z
                .string()
                .nullable()
                .describe(
                    'Human-readable timeframe (e.g. "last 30 days"). Null when not time-bound.',
                ),
        })
        .describe('Structured payload accompanying the chip label.'),
});

const actionChipModelSchema = z.object({
    kind: z.literal('action'),
    label: z
        .string()
        .min(3)
        .max(40)
        .describe(
            'Short action label, e.g. "Save as chart" or "Pin to dashboard".',
        ),
    action: z
        .enum(AGENT_SUGGESTION_ACTIONS)
        .describe(
            'Which UI workflow this chip invokes. Action chips do not submit text; they trigger a handler.',
        ),
});

// Schema sent to the LLM via generateObject. The model never sees or fills in
// artifactUuid — the server binds it after the fact to the latest assistant
// artifact. This makes hallucinated UUIDs structurally impossible.
export const agentSuggestionsModelSchema = z.object({
    chips: z
        .array(
            z.discriminatedUnion('kind', [
                promptChipSchema,
                actionChipModelSchema,
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
