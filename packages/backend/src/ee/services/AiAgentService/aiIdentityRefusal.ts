import {
    AI_IDENTITY_NOT_READY_CODE,
    AI_IDENTITY_SCHEMA_CHANGED_MESSAGE,
    AI_IDENTITY_SYNC_UNSAFE_CODE,
    AI_IDENTITY_SYNC_UNSAFE_MESSAGE,
    AiIdentityState,
    getAiIdentityPersonMessage,
    ParameterError,
    type AiAccessForUser,
} from '@lightdash/common';

export type AiIdentityRefusal = {
    code:
        | typeof AI_IDENTITY_NOT_READY_CODE
        | typeof AI_IDENTITY_SYNC_UNSAFE_CODE;
    state: AiIdentityState;
    message: string;
};

export const getAiIdentityRefusal = (
    access: AiAccessForUser,
): AiIdentityRefusal | null => {
    if (!access.aiIdentityRequired) return null;
    if (access.automaticSyncRefusal)
        return {
            code: AI_IDENTITY_SYNC_UNSAFE_CODE,
            state: AiIdentityState.PENDING,
            message:
                access.message === AI_IDENTITY_SCHEMA_CHANGED_MESSAGE
                    ? access.message
                    : AI_IDENTITY_SYNC_UNSAFE_MESSAGE,
        };
    if (access.state === AiIdentityState.READY) return null;
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
