import type { AiModelOption } from '@lightdash/common';

// Composite key format: "provider:name"
export const getModelKey = (model: AiModelOption): string =>
    `${model.provider}:${model.name}`;
