import {
    AI_IDENTITY_NOT_READY_CODE,
    AiIdentityState,
    getAiIdentityPersonMessage,
    ParameterError,
    type AiAccessForUser,
} from '@lightdash/common';

export type AiIdentityRefusal = {
    code: typeof AI_IDENTITY_NOT_READY_CODE;
    state: AiIdentityState;
    message: string;
};

export const getAiIdentityRefusal = (
    access: AiAccessForUser,
): AiIdentityRefusal | null => {
    if (!access.aiIdentityRequired || access.state === AiIdentityState.READY)
        return null;
    const state = access.state ?? AiIdentityState.PENDING;
    return {
        code: AI_IDENTITY_NOT_READY_CODE,
        state,
        message: access.message ?? getAiIdentityPersonMessage(state),
    };
};

export class AiIdentityPromptRefusalError extends ParameterError {
    constructor(refusal: AiIdentityRefusal) {
        super(JSON.stringify(refusal), refusal);
    }
}
