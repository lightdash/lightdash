import { isAiAccessRefusal, type AiAccessRefusal } from '@lightdash/common';
export const getAiAccessRefusal = (output: unknown): AiAccessRefusal | null => {
    if (
        !output ||
        typeof output !== 'object' ||
        !('structuredContent' in output)
    )
        return null;
    const content = output.structuredContent;
    if (!content || typeof content !== 'object' || !('refusal' in content))
        return null;
    return isAiAccessRefusal(content.refusal) ? content.refusal : null;
};
