import {
    AI_IDENTITY_NOT_READY_CODE,
    AI_IDENTITY_SYNC_UNSAFE_CODE,
    AiIdentityState,
} from '@lightdash/common';
import { z } from 'zod';

const refusalSchema = z.object({
    code: z.union([
        z.literal(AI_IDENTITY_NOT_READY_CODE),
        z.literal(AI_IDENTITY_SYNC_UNSAFE_CODE),
    ]),
    state: z.enum([
        AiIdentityState.NEEDS_SIGN_IN,
        AiIdentityState.PENDING,
        AiIdentityState.FAILED,
    ]),
    message: z.string(),
});

export const parseAiIdentityRefusal = (
    errorMessage: string | null | undefined,
) => {
    if (!errorMessage) return null;
    try {
        const result = refusalSchema.safeParse(JSON.parse(errorMessage));
        return result.success ? result.data : null;
    } catch {
        return null;
    }
};
