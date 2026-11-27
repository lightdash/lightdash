import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { findSemanticStudioPreset } from '../ai/models/modelPreference';
import {
    SemanticStudioChatService,
    type SemanticStudioChatServiceArguments,
} from './SemanticStudioChatService';

const PROJECT_UUID = 'project-uuid';
const THREAD_UUID = 'thread-uuid';
const MESSAGE_UUID = 'message-uuid';
const ARTIFACT_UUID = 'artifact-uuid';
const VERSION_UUID = 'version-uuid';
const ref = { projectUuid: PROJECT_UUID, threadUuid: THREAD_UUID };
const artifactRef = {
    projectUuid: PROJECT_UUID,
    artifactUuid: ARTIFACT_UUID,
    versionUuid: VERSION_UUID,
};
const messageRef = { ...ref, messageUuid: MESSAGE_UUID };

const withAbility = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
): SessionUser => ({
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>(rules),
});
const owner = withAbility([]);
const someoneElse: SessionUser = { ...owner, userUuid: 'someone-else' };
const agentManager: SessionUser = {
    ...withAbility([{ subject: 'AiAgent', action: 'manage' }]),
    userUuid: 'agent-manager',
};

const setup = ({
    threadAgentUuid = 'agent-uuid',
    canUseStudio = true,
    copilotEnabled = true,
}: {
    threadAgentUuid?: string | null;
    canUseStudio?: boolean;
    copilotEnabled?: boolean;
} = {}) => {
    const agent = { uuid: threadAgentUuid, projectUuid: PROJECT_UUID };
    const thread = { uuid: THREAD_UUID, user: { uuid: owner.userUuid } };
    const ai = {
        getIsCopilotEnabled: vi.fn(async () => copilotEnabled),
        getThreadForAuthorized: vi.fn(),
        createThreadForAgent: vi.fn(),
        createMessageForAuthorized: vi.fn(),
        streamResponseForAuthorized: vi.fn(),
        interruptMessageForAuthorized: vi.fn(),
        steerMessageForAuthorized: vi.fn(),
        generateTitleForAuthorized: vi.fn(),
        getArtifactVizQueryForAuthorized: vi.fn(),
        getArtifactQueryResultsForAuthorized: vi.fn(),
        updateArtifactVersionForAuthorized: vi.fn(),
    } satisfies SemanticStudioChatServiceArguments['ai'];
    const getBuilderAgent = vi.fn(async () => ({ uuid: 'built-in-agent' }));
    const getAgent = vi.fn();
    getAgent.mockResolvedValue(agent);
    const getThread = vi.fn();
    getThread.mockResolvedValue(thread);
    const artifact = {
        artifactUuid: ARTIFACT_UUID,
        versionUuid: VERSION_UUID,
        threadUuid: THREAD_UUID,
    };
    const getArtifact = vi.fn();
    getArtifact.mockResolvedValue(artifact);
    const getStatus = vi.fn();
    getStatus.mockResolvedValue({ enabled: canUseStudio });
    const studio = {
        getStatus,
        assertCanStartThread: vi.fn(),
        proposeDraftChange: vi.fn(),
        draftProjectContextEntry: vi.fn(),
        listChanges: vi.fn(),
        readDraftedModel: vi.fn(),
    };
    const checkout = {
        getBuilderAgent,
        getAgentTurnSetup: vi.fn(),
        findDevelopmentExplores: vi.fn(),
        waitForBranchCompile: vi.fn(),
    };
    const hasRunInProgress = vi.fn(async () => false);
    const findStudioThreadAgentUuid = vi.fn(async () => threadAgentUuid);
    const service = new SemanticStudioChatService({
        ai,
        checkout,
        studio,
        aiWriteback: { hasRunInProgress },
        aiAgentModel: { getAgent, getThread, getArtifact },
        workspaceModel: { findStudioThreadAgentUuid },
    });
    return {
        service,
        ai,
        authorized: { agent, thread },
        artifact,
        getArtifact,
        getBuilderAgent,
        studio,
        checkout,
        hasRunInProgress,
        getAgent,
        getThread,
        findStudioThreadAgentUuid,
    };
};

describe('SemanticStudioChatService', () => {
    describe('starting a conversation', () => {
        it('starts on the built-in agent as a Studio thread', async () => {
            const { service, ai, getBuilderAgent, getAgent, studio } = setup();

            await service.createThread(
                owner,
                PROJECT_UUID,
                { prompt: 'Add a revenue metric' },
                'web_app',
            );

            expect(getBuilderAgent).toHaveBeenCalledWith(owner, PROJECT_UUID);
            expect(getAgent).toHaveBeenCalledWith({
                organizationUuid: owner.organizationUuid,
                agentUuid: 'built-in-agent',
                agentKind: 'semantic_studio',
            });
            expect(ai.createThreadForAgent).toHaveBeenCalledWith(
                owner,
                expect.objectContaining({ projectUuid: PROJECT_UUID }),
                {
                    prompt: 'Add a revenue metric',
                    createdFrom: 'semantic_studio',
                },
                'web_app',
                undefined,
                findSemanticStudioPreset,
            );
            expect(studio.assertCanStartThread).toHaveBeenCalledWith(
                owner,
                PROJECT_UUID,
                'web_app',
            );
        });

        it('starts nothing from a surface Studio does not start threads on', async () => {
            const { service, ai, studio } = setup();
            studio.assertCanStartThread.mockRejectedValueOnce(
                new ForbiddenError(),
            );

            await expect(
                service.createThread(
                    owner,
                    PROJECT_UUID,
                    { prompt: 'Hi' },
                    'api',
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(ai.createThreadForAgent).not.toHaveBeenCalled();
        });

        it('starts nothing when the built-in agent is refused', async () => {
            const { service, ai, getBuilderAgent } = setup();
            getBuilderAgent.mockRejectedValueOnce(new ForbiddenError());

            await expect(
                service.createThread(
                    owner,
                    PROJECT_UUID,
                    { prompt: 'Hi' },
                    'web_app',
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(ai.createThreadForAgent).not.toHaveBeenCalled();
        });

        it('starts nothing when AI is off', async () => {
            const { service, ai } = setup({ copilotEnabled: false });

            await expect(
                service.createThread(
                    owner,
                    PROJECT_UUID,
                    { prompt: 'Hi' },
                    'web_app',
                ),
            ).rejects.toThrow('Copilot is not enabled');
            expect(ai.createThreadForAgent).not.toHaveBeenCalled();
        });
    });

    describe('who may use a conversation', () => {
        it('lets its owner in when they can use Studio', async () => {
            const { service, ai, authorized } = setup();

            await service.getThread(owner, ref);

            expect(ai.getThreadForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
            );
        });

        it("follows Studio's permission, not Ask AI's", async () => {
            // The owner has no AI agent permission at all.
            const allowed = setup({ canUseStudio: true });
            await expect(
                allowed.service.getThread(owner, ref),
            ).resolves.toBeUndefined();

            const refused = setup({ canUseStudio: false });
            await expect(refused.service.getThread(owner, ref)).rejects.toThrow(
                ForbiddenError,
            );
            expect(refused.ai.getThreadForAuthorized).not.toHaveBeenCalled();
        });

        it("refuses someone else's conversation", async () => {
            const { service, ai } = setup();

            await expect(service.getThread(someoneElse, ref)).rejects.toThrow(
                'Insufficient permissions to view this thread',
            );
            await expect(
                service.createMessage(someoneElse, ref, { prompt: 'Hi' }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.streamResponse(someoneElse, ref, undefined),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.generateTitle(someoneElse, ref),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.interruptMessage(someoneElse, messageRef),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.steerMessage(someoneElse, messageRef, 'Stop'),
            ).rejects.toThrow(ForbiddenError);
            expect(ai.getThreadForAuthorized).not.toHaveBeenCalled();
            expect(ai.createMessageForAuthorized).not.toHaveBeenCalled();
            expect(ai.streamResponseForAuthorized).not.toHaveBeenCalled();
            expect(ai.generateTitleForAuthorized).not.toHaveBeenCalled();
            expect(ai.interruptMessageForAuthorized).not.toHaveBeenCalled();
            expect(ai.steerMessageForAuthorized).not.toHaveBeenCalled();
        });

        it("lets someone who manages agents into another person's conversation", async () => {
            const { service, ai } = setup();

            await service.getThread(agentManager, ref);

            expect(ai.getThreadForAuthorized).toHaveBeenCalled();
        });

        it('refuses someone who manages agents but cannot use Studio', async () => {
            const { service } = setup({ canUseStudio: false });

            await expect(service.getThread(agentManager, ref)).rejects.toThrow(
                ForbiddenError,
            );
        });

        it('answers not found for a thread that is not a Studio one in this project', async () => {
            const { service, ai, getAgent } = setup({ threadAgentUuid: null });

            await expect(service.getThread(owner, ref)).rejects.toThrow(
                NotFoundError,
            );
            await expect(
                service.streamResponse(owner, ref, undefined),
            ).rejects.toThrow(NotFoundError);
            expect(getAgent).not.toHaveBeenCalled();
            expect(ai.getThreadForAuthorized).not.toHaveBeenCalled();
            expect(ai.streamResponseForAuthorized).not.toHaveBeenCalled();
        });

        it('checks AI is on where the agent routes do', async () => {
            const { service, ai } = setup({ copilotEnabled: false });

            await expect(service.getThread(owner, ref)).rejects.toThrow(
                'Copilot is not enabled',
            );
            await expect(
                service.createMessage(owner, ref, { prompt: 'Hi' }),
            ).rejects.toThrow('Copilot is not enabled');
            await expect(service.generateTitle(owner, ref)).rejects.toThrow(
                'Copilot is not enabled',
            );
            // The turn checks for itself, and stopping one never asked.
            await service.streamResponse(owner, ref, undefined);
            await service.interruptMessage(owner, messageRef);
            expect(ai.streamResponseForAuthorized).toHaveBeenCalled();
            expect(ai.interruptMessageForAuthorized).toHaveBeenCalled();
        });
    });

    describe('what it passes on', () => {
        it('reads the thread through the agent it runs on, built-in or not', async () => {
            const { service, getAgent, getThread, findStudioThreadAgentUuid } =
                setup({ threadAgentUuid: 'older-user-agent' });

            await service.getThread(owner, ref);

            expect(findStudioThreadAgentUuid).toHaveBeenCalledWith(
                PROJECT_UUID,
                THREAD_UUID,
            );
            // Whichever kind of agent the conversation runs on.
            expect(getAgent).toHaveBeenCalledWith({
                organizationUuid: owner.organizationUuid,
                agentUuid: 'older-user-agent',
                agentKind: 'any',
            });
            expect(getThread).toHaveBeenCalledWith({
                organizationUuid: owner.organizationUuid,
                agentUuid: 'older-user-agent',
                threadUuid: THREAD_UUID,
            });
        });

        it('passes a message, a title request and the stream options', async () => {
            const { service, ai, authorized } = setup();

            await service.createMessage(owner, ref, { prompt: 'And a margin' });
            await service.generateTitle(owner, ref);
            await service.streamResponse(owner, ref, { autoApproveSql: true });
            await service.streamResponse(owner, ref, undefined);

            expect(ai.createMessageForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
                { prompt: 'And a margin' },
                undefined,
                findSemanticStudioPreset,
            );
            expect(ai.generateTitleForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
            );
            expect(ai.streamResponseForAuthorized).toHaveBeenNthCalledWith(
                1,
                owner,
                authorized,
                {
                    enableSqlMode: undefined,
                    enableFastDecisions: true,
                    autoApproveSql: true,
                    toolHints: [],
                },
                expect.anything(),
            );
            expect(ai.streamResponseForAuthorized).toHaveBeenNthCalledWith(
                2,
                owner,
                authorized,
                {
                    enableSqlMode: undefined,
                    enableFastDecisions: true,
                    autoApproveSql: false,
                    toolHints: [],
                },
                expect.anything(),
            );
        });

        it("brings Studio's setup and the builder's tools to each turn", async () => {
            const { service, ai, checkout, studio, hasRunInProgress } = setup();
            const turnSetup = { studio: null };
            checkout.getAgentTurnSetup.mockResolvedValue(turnSetup);

            await service.streamResponse(owner, ref, undefined);
            const [, , , turnInputs] =
                ai.streamResponseForAuthorized.mock.calls[0];

            // Asked for by the turn, not before it.
            expect(checkout.getAgentTurnSetup).not.toHaveBeenCalled();
            await expect(turnInputs.getTurnSetup()).resolves.toBe(turnSetup);
            expect(checkout.getAgentTurnSetup).toHaveBeenCalledWith(
                owner,
                PROJECT_UUID,
            );

            const tools = turnInputs.buildExtraTools({
                promptUuid: 'prompt-uuid',
                threadUuid: THREAD_UUID,
                getExplore: vi.fn(),
                runAsyncQuery: vi.fn(),
            });
            expect(Object.keys(tools).sort()).toEqual([
                'draftProjectContext',
                'getDraftExplore',
                'listChanges',
                'proposeSemanticLayerChange',
                'readSemanticModel',
                'runDraftQuery',
                'verify',
            ]);
            await tools.listChanges();
            expect(studio.listChanges).toHaveBeenCalledWith(
                owner,
                PROJECT_UUID,
                THREAD_UUID,
            );
            await tools.verify({ check: 'compile' });
            const [, , { isSaving }] =
                checkout.waitForBranchCompile.mock.calls[0];
            await isSaving();
            expect(hasRunInProgress).toHaveBeenCalledWith(THREAD_UUID);
        });

        it('interrupts and steers a message of the thread', async () => {
            const { service, ai, authorized } = setup();

            await service.interruptMessage(owner, messageRef);
            await service.steerMessage(owner, messageRef, 'Use net revenue');

            expect(ai.interruptMessageForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
                MESSAGE_UUID,
            );
            expect(ai.steerMessageForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
                MESSAGE_UUID,
                'Use net revenue',
            );
        });
    });

    describe('what a conversation made', () => {
        it("reads an artifact, runs its query and links its saved chart for the thread's owner", async () => {
            const { service, ai, authorized, artifact, getArtifact } = setup();
            const account = fromSession(owner);

            await expect(service.getArtifact(owner, artifactRef)).resolves.toBe(
                artifact,
            );
            await service.getArtifactVizQuery(owner, artifactRef, account);
            await service.linkArtifactSavedSql(owner, artifactRef, 'sql-uuid');
            const page = { queryUuid: 'query-uuid', page: null, pageSize: 50 };
            await service.getArtifactQueryResults(
                owner,
                artifactRef,
                page,
                account,
            );
            expect(
                ai.getArtifactQueryResultsForAuthorized,
            ).toHaveBeenCalledWith(owner, authorized, artifact, page, account);

            expect(getArtifact).toHaveBeenCalledWith(
                ARTIFACT_UUID,
                VERSION_UUID,
            );
            expect(ai.getArtifactVizQueryForAuthorized).toHaveBeenCalledWith(
                owner,
                authorized,
                artifact,
                account,
            );
            expect(ai.updateArtifactVersionForAuthorized).toHaveBeenCalledWith(
                authorized,
                VERSION_UUID,
                { savedSqlUuid: 'sql-uuid' },
            );
        });

        it("follows the conversation's rule: Studio permission, and theirs or an agent manager's", async () => {
            const { service, ai } = setup();
            await expect(
                service.getArtifact(someoneElse, artifactRef),
            ).rejects.toThrow(
                'Insufficient permissions to access this artifact',
            );
            await expect(
                service.getArtifactVizQuery(
                    someoneElse,
                    artifactRef,
                    fromSession(someoneElse),
                ),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.linkArtifactSavedSql(someoneElse, artifactRef, null),
            ).rejects.toThrow(
                'Insufficient permissions to update this artifact',
            );
            await expect(
                service.getArtifactQueryResults(
                    someoneElse,
                    artifactRef,
                    { queryUuid: 'query-uuid', page: null, pageSize: null },
                    fromSession(someoneElse),
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(ai.getArtifactVizQueryForAuthorized).not.toHaveBeenCalled();
            expect(
                ai.getArtifactQueryResultsForAuthorized,
            ).not.toHaveBeenCalled();
            expect(
                ai.updateArtifactVersionForAuthorized,
            ).not.toHaveBeenCalled();

            await expect(
                service.getArtifact(agentManager, artifactRef),
            ).resolves.toBeDefined();
            await expect(
                setup({ canUseStudio: false }).service.getArtifact(
                    owner,
                    artifactRef,
                ),
            ).rejects.toThrow(ForbiddenError);
        });

        it('refuses an artifact of a thread that is not a Studio one in this project, as the agent routes do', async () => {
            const { service } = setup({ threadAgentUuid: null });

            await expect(
                service.getArtifact(owner, artifactRef),
            ).rejects.toThrow(ForbiddenError);
        });

        it('checks AI is on, and leaves a missing artifact to the model', async () => {
            await expect(
                setup({ copilotEnabled: false }).service.getArtifact(
                    owner,
                    artifactRef,
                ),
            ).rejects.toThrow('Copilot is not enabled');

            const { service, getArtifact } = setup();
            getArtifact.mockRejectedValueOnce(
                new NotFoundError('Artifact artifact-uuid not found'),
            );
            await expect(
                service.getArtifact(owner, artifactRef),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
