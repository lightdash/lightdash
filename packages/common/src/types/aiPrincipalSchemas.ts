import { z } from 'zod';
import { AiTransportKind } from './aiPrincipal';

export const aiTransportSchema = z.object({
    kind: z.literal(AiTransportKind.DIRECT),
});
