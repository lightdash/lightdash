import { isSlackPrompt, QuerySurface, type AiPrompt } from '@lightdash/common';

export const querySurfaceFromPrompt = (prompt: AiPrompt): QuerySurface => {
    if (isSlackPrompt(prompt)) return QuerySurface.SLACK;
    return prompt.threadCreatedFrom === 'api'
        ? QuerySurface.API
        : QuerySurface.APP;
};
