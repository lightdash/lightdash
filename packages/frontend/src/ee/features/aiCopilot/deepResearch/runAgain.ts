import {
    type DeepResearchRunRegistration,
    type StartDeepResearchArgs,
} from './types';

type RunDeepResearchAgainArgs = {
    registration: DeepResearchRunRegistration;
    createPrompt: (question: string) => Promise<{ uuid: string }>;
    startRun: (
        args: StartDeepResearchArgs & { promptUuid: string },
    ) => Promise<unknown>;
};

export const runDeepResearchAgain = async ({
    registration,
    createPrompt,
    startRun,
}: RunDeepResearchAgainArgs): Promise<void> => {
    const promptUuid = (await createPrompt(registration.question)).uuid;
    await startRun({
        question: registration.question,
        promptUuid,
    });
};
