import { type SessionUser } from '@lightdash/common';
import { developmentView } from '../../../services/ProjectService/developmentView';
import {
    type DraftProjectContextFn,
    type GetExploreFn,
    type ProposeSemanticLayerChangeFn,
    type ReadSemanticModelFn,
    type RunAsyncQueryFn,
    type VerifyFn,
} from '../ai/types/aiAgentDependencies';
import { type SemanticStudioCheckoutService } from './SemanticStudioCheckoutService';
import { type SemanticStudioService } from './SemanticStudioService';

type StudioAgentToolsArgs = {
    user: SessionUser;
    projectUuid: string;
    promptUuid: string;
    threadUuid: string;
    semanticStudioService: Pick<
        SemanticStudioService,
        | 'proposeDraftChange'
        | 'draftProjectContextEntry'
        | 'listChanges'
        | 'readDraftedModel'
    >;
    semanticStudioCheckoutService: Pick<
        SemanticStudioCheckoutService,
        'findDevelopmentExplores' | 'waitForBranchCompile'
    >;
    getExplore: GetExploreFn;
    runAsyncQuery: RunAsyncQueryFn;
    /** Whether the agent is still saving to its pull request. */
    isSaving: () => Promise<boolean>;
};

/** What the builder's tools do for one turn: draft changes, read the draft, and query through it. */
export const getStudioAgentTools = ({
    user,
    projectUuid,
    promptUuid,
    threadUuid,
    semanticStudioService,
    semanticStudioCheckoutService,
    getExplore,
    runAsyncQuery,
    isSaving,
}: StudioAgentToolsArgs) => {
    const proposeSemanticLayerChange: ProposeSemanticLayerChangeFn = (
        models,
        changeName,
    ) =>
        semanticStudioService.proposeDraftChange(
            user,
            projectUuid,
            models,
            { promptUuid, threadUuid },
            changeName,
        );

    const draftProjectContext: DraftProjectContextFn = (entry, changeName) =>
        semanticStudioService.draftProjectContextEntry(
            user,
            projectUuid,
            entry,
            promptUuid,
            changeName,
        );

    const listChanges = () =>
        semanticStudioService.listChanges(user, projectUuid, threadUuid);

    // Studio queries read the person's draft over what is published, the way trying their changes does.
    const inDraft = <T>(run: () => Promise<T>): Promise<T> => {
        let drafted:
            | ReturnType<
                  SemanticStudioCheckoutService['findDevelopmentExplores']
              >
            | undefined;
        // Reading the draft reads the project itself, which must see what is published.
        const findExplores = () => {
            drafted ??= developmentView.exit(() =>
                semanticStudioCheckoutService.findDevelopmentExplores(
                    user,
                    projectUuid,
                ),
            );
            return drafted;
        };
        return developmentView.run(
            {
                findExplores,
                hasChanges: async () => (await findExplores()) !== null,
            },
            run,
        );
    };
    const getDraftExplore: GetExploreFn = (args) =>
        inDraft(() => getExplore(args));
    const runDraftQuery: RunAsyncQueryFn = (...args) =>
        inDraft(() => runAsyncQuery(...args));

    const readSemanticModel: ReadSemanticModelFn = (name) =>
        semanticStudioService.readDraftedModel(user, projectUuid, name);

    const verify: VerifyFn = () =>
        semanticStudioCheckoutService.waitForBranchCompile(user, projectUuid, {
            threadUuid,
            isSaving,
            timeoutMs: 60_000,
        });

    return {
        proposeSemanticLayerChange,
        draftProjectContext,
        listChanges,
        getDraftExplore,
        runDraftQuery,
        readSemanticModel,
        verify,
    };
};
