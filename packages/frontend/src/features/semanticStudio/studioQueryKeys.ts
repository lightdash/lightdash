import { type QueryClient } from '@tanstack/react-query';
import {
    PULL_REQUEST_CI_CHECKS_KEY,
    PULL_REQUEST_DIFF_KEY,
} from '../writeback/writebackQueryKeys';

export const DRAFT_KEY = 'semantic-layer-draft';
export const DRAFT_STATE_KEY = 'semantic-layer-draft-state';
export const MODEL_KEY = 'semantic-layer-model';
export const CHECKOUT_KEY = 'semantic-studio-checkout';
export const WORKSPACES_KEY = 'semantic-studio-workspaces';
export const SOURCES_KEY = 'semantic-studio-sources';
export const MODEL_VERSION_KEY = 'semantic-studio-model-version';
export const UNBUILT_FIELDS_KEY = 'semantic-studio-unbuilt-fields';

/** What a Studio write moved; the workspace list is always read again. */
type StudioInvalidation = {
    /** The draft, and Explore's explore list, which reads the checked-out draft on any page. */
    draft: boolean;
    draftState: boolean;
    checkout: boolean;
    /** The published models and their pre-aggregates. */
    liveModels: boolean;
    /** Every project's files, and this project's pull request diffs and checks. */
    sources: boolean;
    /** The checks of this one pull request. */
    pullRequestChecks: string | null;
};

export const invalidateStudio = (
    queryClient: QueryClient,
    projectUuid: string,
    {
        draft,
        draftState,
        checkout,
        liveModels,
        sources,
        pullRequestChecks,
    }: StudioInvalidation,
) =>
    Promise.all(
        [
            ...(draft ? [[DRAFT_KEY, projectUuid]] : []),
            ...(draftState ? [[DRAFT_STATE_KEY, projectUuid]] : []),
            [WORKSPACES_KEY, projectUuid],
            ...(checkout ? [[CHECKOUT_KEY, projectUuid]] : []),
            ...(draft ? [['tables']] : []),
            ...(liveModels
                ? [
                      [MODEL_KEY, projectUuid],
                      ['preAggregateMaterializations', projectUuid],
                  ]
                : []),
            ...(sources
                ? [
                      [SOURCES_KEY],
                      [PULL_REQUEST_DIFF_KEY, projectUuid],
                      [PULL_REQUEST_CI_CHECKS_KEY, projectUuid],
                  ]
                : []),
            ...(pullRequestChecks !== null
                ? [[PULL_REQUEST_CI_CHECKS_KEY, projectUuid, pullRequestChecks]]
                : []),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
