import { ParseError, type ManagedAgentAggression } from '@lightdash/common';
import { z } from 'zod';

const validatedModelSchema = z
    .object({
        provider: z.string().trim().min(1),
        model: z.string().trim().min(1),
        mode: z.enum(['observe', 'flag', 'cleanup']),
    })
    .strict();

export type AutopilotValidatedModel = z.infer<typeof validatedModelSchema>;

export const parseAutopilotValidatedModels = (
    value: string | undefined,
): AutopilotValidatedModel[] => {
    if (!value) return [];
    try {
        return z.array(validatedModelSchema).parse(JSON.parse(value));
    } catch {
        throw new ParseError(
            'MANAGED_AGENT_VALIDATED_MODELS must be a JSON array of { provider, model, mode } entries',
        );
    }
};

const modes: ManagedAgentAggression[] = ['observe', 'flag', 'cleanup'];

export const getAutopilotCleanupMode = (
    requested: ManagedAgentAggression,
    provider: string | null,
    model: string | null,
    validatedModels: AutopilotValidatedModel[],
): ManagedAgentAggression => {
    const matches = validatedModels.filter(
        (entry) => entry.provider === provider && entry.model === model,
    );
    const approved =
        matches.length > 0
            ? Math.min(...matches.map((entry) => modes.indexOf(entry.mode)))
            : 0;
    return modes[Math.min(modes.indexOf(requested), approved)];
};
