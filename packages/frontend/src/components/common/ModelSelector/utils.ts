import type { AiModelOption } from '@lightdash/ai';

// Composite key format: "provider:name"
export const getModelKey = (model: AiModelOption): string =>
    `${model.provider}:${model.name}`;
