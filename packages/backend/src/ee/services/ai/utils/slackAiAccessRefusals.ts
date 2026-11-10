import {
    AiAccessRefusedError,
    isAiAccessRefusal,
    type AiAccessRefusal,
} from '@lightdash/common';
import type { OnToolCallFinishEvent } from 'ai';
import { z } from 'zod';

const refusalOutputSchema = z.object({
    structuredContent: z.object({
        refusal: z.custom<AiAccessRefusal>(isAiAccessRefusal),
    }),
});

export const getAiAccessRefusalFromToolFinish = (
    event: OnToolCallFinishEvent,
): AiAccessRefusal | null => {
    if (event.toolOutput.type === 'tool-error') {
        return event.toolOutput.error instanceof AiAccessRefusedError
            ? event.toolOutput.error.refusal
            : null;
    }
    if (event.toolOutput.type === 'tool-result') {
        const parsed = refusalOutputSchema.safeParse(event.toolOutput.output);
        return parsed.success ? parsed.data.structuredContent.refusal : null;
    }
    return null;
};
