export const getAiAgentThreadOwnerExpression = ({
    webAppOwner,
    firstPromptOwner,
}: {
    webAppOwner: string;
    firstPromptOwner: string;
}) => `COALESCE(${webAppOwner}, ${firstPromptOwner})`;
