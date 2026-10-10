import {
    getAdditionalAgentPermissionRequirements,
    isAiAccessRefusal,
    type AiAccessRefusal,
    type UiStringResolver,
} from '@lightdash/common';
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

export const getAiAccessRefusalRequirements = (
    refusal: AiAccessRefusal,
    getUiString?: UiStringResolver,
): string | null => {
    const requirements = getAdditionalAgentPermissionRequirements(
        refusal,
        getUiString,
    );
    return requirements.length ? requirements.join(', ') : null;
};
