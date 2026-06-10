type SuggestionThread = {
    createdFrom: string;
    user: {
        uuid: string;
    };
};

export const canGeneratePostResponseSuggestions = (
    userUuid: string,
    thread: SuggestionThread,
) => thread.createdFrom === 'web_app' && thread.user.uuid === userUuid;
