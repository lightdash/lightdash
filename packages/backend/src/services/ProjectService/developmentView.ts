import {
    isExploreError,
    ParameterError,
    toExploreSummary,
    type Account,
    type Explore,
    type ExploreError,
    type SummaryExplore,
} from '@lightdash/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type DevelopmentView = {
    /**
     * The explores as this person's unpublished changes leave them, by name, with
     * null for one the changes remove; null when they have nothing in development
     * on the project.
     */
    findExplores: (
        account: Account,
        projectUuid: string,
    ) => Promise<Map<string, Explore | ExploreError | null> | null>;
    /** Whether the person making this request has unpublished changes on the project that the view is showing them. */
    hasChanges: (projectUuid: string) => Promise<boolean>;
};

/** Set for a request that asked for the development view; absent for every other request, job and agent run. */
export const developmentView = new AsyncLocalStorage<DevelopmentView>();

/**
 * Refuses to save content that reads fields while the request shows this person
 * their unpublished changes to the project: what was built there may use fields
 * only they have, and would be broken for everyone else.
 */
export const assertCanSaveInDevelopmentView = async (
    projectUuid: string,
): Promise<void> => {
    if (await developmentView.getStore()?.hasChanges(projectUuid)) {
        throw new ParameterError(
            'Saving is off while you are trying your changes. Go back to live to save.',
        );
    }
};

/** A compiled explore as the explore list carries it, with what decides who may see its base table. */
export const toExploreSummaryWithAccess = (
    explore: Explore | ExploreError,
): SummaryExplore & {
    baseTableRequiredAttributes: Explore['tables'][string]['requiredAttributes'];
    baseTableAnyAttributes: Explore['tables'][string]['anyAttributes'];
} => {
    const baseTable = isExploreError(explore)
        ? undefined
        : explore.tables[explore.baseTable];
    return {
        ...toExploreSummary(explore),
        baseTableRequiredAttributes: baseTable?.requiredAttributes,
        baseTableAnyAttributes: baseTable?.anyAttributes,
    };
};
